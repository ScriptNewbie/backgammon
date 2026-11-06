#include "search.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <numeric>
#include <stdexcept>

#include "features.hpp"

namespace bg {
namespace {

using Clock = std::chrono::steady_clock;
double msSince(Clock::time_point t) { return std::chrono::duration<double, std::milli>(Clock::now() - t).count(); }

}  // namespace

bool terminalForMover(const Board& b, Probs& out) {
  const Result r = moverResult(b);
  if (r == Result::None) return false;
  out = Probs{{1.0f, r == Result::Single ? 0.0f : 1.0f, r == Result::Backgammon ? 1.0f : 0.0f, 0.0f, 0.0f}};
  return true;
}

const std::vector<Roll>& allRolls() {
  static const std::vector<Roll> rolls = [] {
    std::vector<Roll> r;
    for (int a = 1; a <= 6; a++) {
      for (int b = a; b <= 6; b++) r.push_back(Roll{a, b, a == b ? 1.0f / 36.0f : 2.0f / 36.0f});
    }
    return r;
  }();
  return rolls;
}

std::vector<int> applyFilter(const std::vector<double>& equities, const MoveFilter& filter) {
  std::vector<int> order(equities.size());
  std::iota(order.begin(), order.end(), 0);
  // Stable: equal equities keep play order, so results do not depend on sort internals.
  std::stable_sort(order.begin(), order.end(), [&](int a, int b) { return equities[a] > equities[b]; });
  std::vector<int> kept;
  for (size_t i = 0; i < order.size(); i++) {
    if (i == 0) {
      kept.push_back(order[0]);
      continue;
    }
    if (static_cast<int>(kept.size()) >= filter.maxKeep) break;
    if (equities[order[0]] - equities[order[i]] > filter.threshold) break;
    kept.push_back(order[i]);
  }
  return kept;
}

// ---- Store: one tree arena ----

void Search::Store::clear() {
  leafBoards.clear();
  leafHashes.clear();
  if (table.size() != 1024) table.assign(1024, -1);
  else std::fill(table.begin(), table.end(), -1);
  nodes.clear();
  rolls.clear();
  children.clear();
  exact.clear();
  pending.clear();
  fixups.clear();
  roots.clear();
  nodesExpanded = 0;
  leafVisits = 0;
}

void Search::Store::growTable() {
  table.assign(table.size() * 2, -1);
  const size_t mask = table.size() - 1;
  for (size_t k = 0; k < leafHashes.size(); k++) {
    size_t i = leafHashes[k] & mask;
    while (table[i] >= 0) i = (i + 1) & mask;
    table[i] = static_cast<int32_t>(k);
  }
}

Search::Ref Search::Store::leaf(const Board& board) {
  leafVisits++;
  const uint64_t h = boardHash(board);
  const size_t mask = table.size() - 1;
  size_t i = h & mask;
  for (; table[i] >= 0; i = (i + 1) & mask) {
    const int32_t k = table[i];
    if (leafHashes[k] == h && sameBoard(leafBoards[k], board)) return Ref{k, Kind::Leaf};
  }
  const int32_t k = static_cast<int32_t>(leafBoards.size());
  leafBoards.push_back(board);
  leafHashes.push_back(h);
  table[i] = k;
  if (leafBoards.size() * 2 > table.size()) growTable();
  return Ref{k, Kind::Leaf};
}

Search::Ref Search::Store::expand(const Board& board, int depth) {
  if (depth == 0) return leaf(board);
  nodesExpanded++;
  const int32_t node = static_cast<int32_t>(nodes.size());
  nodes.push_back(Node{static_cast<int32_t>(rolls.size())});
  const std::vector<Roll>& rollList = allRolls();
  const int32_t rollBegin = static_cast<int32_t>(rolls.size());
  rolls.resize(rolls.size() + rollList.size());
  const int childDepth = depth - 1;
  std::vector<Play>& plays = this->plays[depth];
  std::vector<Child>& local = this->local[depth];

  for (size_t r = 0; r < rollList.size(); r++) {
    local.clear();
    bool needsFilter = false;
    legalPlays(board, rollList[r].die1, rollList[r].die2, plays);
    if (plays.empty()) {
      const Ref pass = expand(flipped(board), childDepth);
      local.push_back(Child{pass.index, pass.kind, 1});
    } else {
      int open = 0;  // plays that do not end the game
      for (const Play& play : plays) open += moverResult(play.result) == Result::None ? 1 : 0;
      for (const Play& play : plays) {
        Probs won;
        if (terminalForMover(play.result, won)) {
          exact.push_back(flipProbs(won));
          local.push_back(Child{static_cast<int32_t>(exact.size() - 1), Kind::Exact, 1});
          continue;
        }
        const Board child = flipped(play.result);
        // With more than one open play and depth left, start with a 0-ply leaf; filterEntry()
        // expands the survivors once values are in.
        const bool provisional = childDepth >= 1 && open > 1;
        const Ref ref = provisional ? leaf(child) : expand(child, childDepth);
        needsFilter = needsFilter || provisional;
        local.push_back(Child{ref.index, ref.kind, 1});
      }
    }
    // Appended after any recursion so each roll's block stays contiguous.
    const int32_t entry = rollBegin + static_cast<int32_t>(r);
    rolls[entry].childBegin = static_cast<int32_t>(children.size());
    children.insert(children.end(), local.begin(), local.end());
    rolls[entry].childEnd = static_cast<int32_t>(children.size());
    rolls[entry].childDepth = static_cast<int8_t>(childDepth);
    if (needsFilter) pending.push_back(entry);
  }
  return Ref{node, Kind::Node};
}

// ---- Search ----

// All children of global `entry` have 0-ply values (leaf or exact). Keep the inner filter's
// survivors and expand the open ones into `chunk`. Reads the global tree; writes only the
// `active` flags of this entry's children.
void Search::filterEntry(int32_t entry, Store& chunk) {
  const RollEntry e = tree_.rolls[entry];
  std::vector<double> equities;
  equities.reserve(e.childEnd - e.childBegin);
  for (int32_t c = e.childBegin; c < e.childEnd; c++) {
    equities.push_back(flipProbs(value(tree_.children[c].ref())).equity());  // mover's view
  }
  const std::vector<int> kept = applyFilter(equities, inner_);
  for (int32_t c = e.childBegin; c < e.childEnd; c++) tree_.children[c].active = 0;
  for (int k : kept) {
    const int32_t c = e.childBegin + k;
    tree_.children[c].active = 1;
    if (tree_.children[c].kind == Kind::Leaf) {
      const Ref deep = chunk.expand(tree_.leafBoards[tree_.children[c].index], e.childDepth);
      chunk.fixups.push_back(Fixup{c, deep});
    }
  }
}

// Append chunk stores [0, chunks) to the global tree in chunk order. Offsets are computed first, the
// global arrays grow once, then every chunk copies (and shifts) its part in parallel. Fixups write
// children that existed before this round; each belongs to exactly one chunk's entries.
void Search::mergeChunks(int chunks, std::vector<Ref>* roots) {
  struct Base {
    size_t leaf, node, roll, child, exact, pending, root;
  };
  std::vector<Base> base(chunks);
  Base at{tree_.leafBoards.size(), tree_.nodes.size(), tree_.rolls.size(), tree_.children.size(),
          tree_.exact.size(), tree_.pending.size(), roots ? roots->size() : 0};
  for (int k = 0; k < chunks; k++) {
    const Store& c = chunks_[k];
    base[k] = at;
    at.leaf += c.leafBoards.size();
    at.node += c.nodes.size();
    at.roll += c.rolls.size();
    at.child += c.children.size();
    at.exact += c.exact.size();
    at.pending += c.pending.size();
    at.root += c.roots.size();
    stats_.nodes += c.nodesExpanded;
    stats_.leafVisits += c.leafVisits;
  }
  tree_.leafBoards.resize(at.leaf);
  tree_.nodes.resize(at.node);
  tree_.rolls.resize(at.roll);
  tree_.children.resize(at.child);
  tree_.exact.resize(at.exact);
  tree_.pending.resize(at.pending);
  if (roots) roots->resize(at.root);

  pool_.run(chunks, [&](int k) {
    const Store& c = chunks_[k];
    const Base& b = base[k];
    auto shift = [&](Ref r) {
      switch (r.kind) {
        case Kind::Leaf: r.index += static_cast<int32_t>(b.leaf); break;
        case Kind::Node: r.index += static_cast<int32_t>(b.node); break;
        case Kind::Exact: r.index += static_cast<int32_t>(b.exact); break;
      }
      return r;
    };
    std::copy(c.leafBoards.begin(), c.leafBoards.end(), tree_.leafBoards.begin() + b.leaf);
    std::copy(c.exact.begin(), c.exact.end(), tree_.exact.begin() + b.exact);
    for (size_t i = 0; i < c.nodes.size(); i++) {
      tree_.nodes[b.node + i] = Node{c.nodes[i].rollBegin + static_cast<int32_t>(b.roll)};
    }
    const int32_t childBase = static_cast<int32_t>(b.child);
    for (size_t i = 0; i < c.rolls.size(); i++) {
      const RollEntry& r = c.rolls[i];
      tree_.rolls[b.roll + i] = RollEntry{r.childBegin + childBase, r.childEnd + childBase, r.childDepth};
    }
    for (size_t i = 0; i < c.children.size(); i++) {
      const Ref r = shift(c.children[i].ref());
      tree_.children[b.child + i] = Child{r.index, r.kind, c.children[i].active};
    }
    for (size_t i = 0; i < c.pending.size(); i++) {
      tree_.pending[b.pending + i] = c.pending[i] + static_cast<int32_t>(b.roll);
    }
    for (const Fixup& f : c.fixups) {
      const Ref r = shift(f.ref);
      tree_.children[f.child].index = r.index;
      tree_.children[f.child].kind = r.kind;
    }
    if (roots) {
      for (size_t i = 0; i < c.roots.size(); i++) (*roots)[b.root + i] = shift(c.roots[i]);
    }
  });
}

void Search::parallelRound(int items, const std::function<void(int, Store&)>& work, std::vector<Ref>* roots) {
  if (items <= 0) return;
  // Contiguous chunks; more chunks than threads so uneven subtrees balance out.
  const int chunks = std::min(items, pool_.size() * 4);
  if (static_cast<int>(chunks_.size()) < chunks) chunks_.resize(chunks);
  auto t = Clock::now();
  pool_.run(chunks, [&](int k) {
    Store& chunk = chunks_[k];
    chunk.clear();
    const int begin = static_cast<int>(static_cast<int64_t>(items) * k / chunks);
    const int end = static_cast<int>(static_cast<int64_t>(items) * (k + 1) / chunks);
    for (int i = begin; i < end; i++) work(i, chunk);
  });
  stats_.expandMs += msSince(t);
  t = Clock::now();
  mergeChunks(chunks, roots);
  stats_.mergeMs += msSince(t);
}

void Search::flushLeaves() {
  const size_t begin = leafValues_.size();
  const size_t total = tree_.leafBoards.size();
  if (begin == total) return;
  stats_.rounds++;
  leafValues_.resize(total);
  constexpr size_t kChunk = 1 << 16;  // rows per net call
  std::vector<float> features;
  std::vector<float> out;
  for (size_t at = begin; at < total; at += kChunk) {
    const size_t n = std::min(kChunk, total - at);
    features.resize(n * kFeatureSize);
    out.resize(n * 5);
    auto t = Clock::now();
    constexpr size_t kSlice = 2048;
    const int slices = static_cast<int>((n + kSlice - 1) / kSlice);
    pool_.run(slices, [&](int s) {
      const size_t lo = s * kSlice, hi = std::min(n, lo + kSlice);
      for (size_t i = lo; i < hi; i++) featurize(tree_.leafBoards[at + i], features.data() + i * kFeatureSize);
    });
    stats_.featurizeMs += msSince(t);
    t = Clock::now();
    net_.infer(features.data(), static_cast<int>(n), out.data());
    stats_.netMs += msSince(t);
    for (size_t i = 0; i < n; i++) std::memcpy(leafValues_[at + i].p, out.data() + i * 5, sizeof(float) * 5);
  }
  stats_.leaves = static_cast<int64_t>(total);
}

Probs Search::value(const Ref& ref) const {
  switch (ref.kind) {
    case Kind::Leaf:
      return leafValues_[ref.index];
    case Kind::Exact:
      return tree_.exact[ref.index];
    case Kind::Node:
      break;
  }
  const std::vector<Roll>& rolls = allRolls();
  const Node& node = tree_.nodes[ref.index];
  double sum[5] = {0, 0, 0, 0, 0};
  for (size_t r = 0; r < rolls.size(); r++) {
    const RollEntry& entry = tree_.rolls[node.rollBegin + r];
    Probs best{};
    double bestEquity = 0;
    bool have = false;
    for (int32_t c = entry.childBegin; c < entry.childEnd; c++) {
      if (!tree_.children[c].active) continue;
      const Probs v = flipProbs(value(tree_.children[c].ref()));  // mover's point of view
      const double e = v.equity();
      if (!have || e > bestEquity) {
        best = v;
        bestEquity = e;
        have = true;
      }
    }
    for (int k = 0; k < 5; k++) sum[k] += rolls[r].weight * best.p[k];
  }
  Probs out;
  for (int k = 0; k < 5; k++) out.p[k] = static_cast<float>(sum[k]);
  return out;
}

std::vector<Probs> Search::evaluate(const std::vector<Board>& boards, int depth) {
  if (depth < 0 || depth > kMaxDepth) throw std::invalid_argument("search depth out of range");
  stats_.threads = pool_.size();
  std::vector<Ref> roots;
  parallelRound(
      static_cast<int>(boards.size()),
      [&](int i, Store& chunk) { chunk.roots.push_back(chunk.expand(boards[i], depth)); }, &roots);

  while (!tree_.pending.empty()) {
    flushLeaves();
    std::vector<int32_t> round;
    round.swap(tree_.pending);
    parallelRound(
        static_cast<int>(round.size()), [&](int i, Store& chunk) { filterEntry(round[i], chunk); }, nullptr);
  }
  flushLeaves();

  const auto t = Clock::now();
  std::vector<Probs> values(roots.size());
  pool_.run(static_cast<int>(roots.size()), [&](int i) { values[i] = value(roots[i]); });
  stats_.backupMs += msSince(t);
  return values;
}

}  // namespace bg
