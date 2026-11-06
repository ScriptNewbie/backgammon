#include "search.hpp"

#include <algorithm>
#include <cstring>
#include <numeric>

#include "features.hpp"
#include "movegen.hpp"

namespace bg {

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

size_t Search::BoardHash::operator()(const Board& b) const {
  // FNV-1a over the 52 bytes.
  uint64_t h = 1469598103934665603ull;
  const auto* p = reinterpret_cast<const uint8_t*>(&b);
  for (size_t i = 0; i < sizeof(Board); i++) {
    h ^= p[i];
    h *= 1099511628211ull;
  }
  return static_cast<size_t>(h);
}

Search::Ref Search::leaf(const Board& board) {
  stats_.leafVisits++;
  auto [it, inserted] = leafIndex_.try_emplace(board, static_cast<int32_t>(leafBoards_.size()));
  if (inserted) leafBoards_.push_back(board);
  return Ref{Kind::Leaf, it->second};
}

Search::Ref Search::expand(const Board& board, int depth) {
  if (depth == 0) return leaf(board);
  stats_.nodes++;
  const int32_t node = static_cast<int32_t>(nodes_.size());
  nodes_.push_back(Node{static_cast<int32_t>(rolls_.size())});
  const std::vector<Roll>& rolls = allRolls();
  const int32_t rollBegin = static_cast<int32_t>(rolls_.size());
  rolls_.resize(rolls_.size() + rolls.size());
  const int childDepth = depth - 1;

  std::vector<Child> local;
  for (size_t r = 0; r < rolls.size(); r++) {
    local.clear();
    bool needsFilter = false;
    const std::vector<Play> plays = legalPlays(board, rolls[r].die1, rolls[r].die2);
    if (plays.empty()) {
      const Board pass = flipped(board);
      local.push_back(Child{expand(pass, childDepth), pass, true});
    } else {
      int open = 0;  // plays that do not end the game
      for (const Play& play : plays) open += moverResult(play.result) == Result::None ? 1 : 0;
      for (const Play& play : plays) {
        Probs exact;
        if (terminalForMover(play.result, exact)) {
          exact_.push_back(flipProbs(exact));
          local.push_back(Child{Ref{Kind::Exact, static_cast<int32_t>(exact_.size() - 1)}, play.result, true});
          continue;
        }
        const Board child = flipped(play.result);
        if (childDepth >= 1 && open > 1) {
          // Provisional 0-ply leaf; filterEntry() expands the survivors once values are in.
          local.push_back(Child{leaf(child), child, true});
          needsFilter = true;
        } else {
          local.push_back(Child{expand(child, childDepth), child, true});
        }
      }
    }
    // Children are appended after any recursion so each roll's block stays contiguous.
    const int32_t entry = rollBegin + static_cast<int32_t>(r);
    rolls_[entry].childBegin = static_cast<int32_t>(children_.size());
    children_.insert(children_.end(), local.begin(), local.end());
    rolls_[entry].childEnd = static_cast<int32_t>(children_.size());
    rolls_[entry].childDepth = static_cast<int8_t>(childDepth);
    if (needsFilter) pending_.push_back(entry);
  }
  return Ref{Kind::Node, node};
}

void Search::flushLeaves() {
  const size_t begin = leafValues_.size();
  if (begin == leafBoards_.size()) return;
  stats_.rounds++;
  leafValues_.resize(leafBoards_.size());
  constexpr size_t kChunk = 1 << 16;  // rows per net call
  std::vector<float> features;
  std::vector<float> out;
  for (size_t at = begin; at < leafBoards_.size(); at += kChunk) {
    const size_t n = std::min(kChunk, leafBoards_.size() - at);
    features.resize(n * kFeatureSize);
    out.resize(n * 5);
    for (size_t i = 0; i < n; i++) featurize(leafBoards_[at + i], features.data() + i * kFeatureSize);
    net_.infer(features.data(), static_cast<int>(n), out.data());
    for (size_t i = 0; i < n; i++) std::memcpy(leafValues_[at + i].p, out.data() + i * 5, sizeof(float) * 5);
  }
  stats_.leaves = static_cast<int64_t>(leafBoards_.size());
}

// All children of `entry` have 0-ply values (leaf or exact). Keep the inner filter's survivors and
// expand the open ones to the entry's child depth.
void Search::filterEntry(int32_t entry) {
  const RollEntry e = rolls_[entry];
  std::vector<double> equities;
  for (int32_t c = e.childBegin; c < e.childEnd; c++) {
    equities.push_back(flipProbs(value(children_[c].ref)).equity());  // mover's point of view
  }
  const std::vector<int> kept = applyFilter(equities, inner_);
  for (int32_t c = e.childBegin; c < e.childEnd; c++) children_[c].active = false;
  for (int k : kept) {
    const int32_t c = e.childBegin + k;
    children_[c].active = true;
    if (children_[c].ref.kind == Kind::Leaf) {
      const Board child = children_[c].board;  // copy: expand() may grow children_
      const Ref deep = expand(child, e.childDepth);
      children_[c].ref = deep;
    }
  }
}

Probs Search::value(const Ref& ref) const {
  switch (ref.kind) {
    case Kind::Leaf:
      return leafValues_[ref.index];
    case Kind::Exact:
      return exact_[ref.index];
    case Kind::Node:
      break;
  }
  const std::vector<Roll>& rolls = allRolls();
  const Node& node = nodes_[ref.index];
  double sum[5] = {0, 0, 0, 0, 0};
  for (size_t r = 0; r < rolls.size(); r++) {
    const RollEntry& entry = rolls_[node.rollBegin + r];
    Probs best{};
    double bestEquity = 0;
    bool have = false;
    for (int32_t c = entry.childBegin; c < entry.childEnd; c++) {
      if (!children_[c].active) continue;
      const Probs v = flipProbs(value(children_[c].ref));  // mover's point of view
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
  std::vector<Ref> roots;
  roots.reserve(boards.size());
  for (const Board& b : boards) roots.push_back(expand(b, depth));

  while (!pending_.empty()) {
    flushLeaves();
    std::vector<int32_t> round;
    round.swap(pending_);
    for (int32_t entry : round) filterEntry(entry);
  }
  flushLeaves();

  std::vector<Probs> values;
  values.reserve(roots.size());
  for (const Ref& r : roots) values.push_back(value(r));
  return values;
}

}  // namespace bg
