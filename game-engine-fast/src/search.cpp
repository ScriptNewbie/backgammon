#include "search.hpp"

#include <algorithm>
#include <cstring>

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

// Every child Ref is stored from the CHILD's side-to-move point of view; value() flips it back.
Search::Ref Search::expand(const Board& board, int depth) {
  if (depth == 0) return leaf(board);
  stats_.nodes++;
  const int32_t node = static_cast<int32_t>(nodes_.size());
  nodes_.push_back(Node{static_cast<int32_t>(rolls_.size())});
  const std::vector<Roll>& rolls = allRolls();
  const int32_t rollBegin = static_cast<int32_t>(rolls_.size());
  rolls_.resize(rolls_.size() + rolls.size());

  std::vector<Ref> local;
  for (size_t r = 0; r < rolls.size(); r++) {
    local.clear();
    const std::vector<Play> plays = legalPlays(board, rolls[r].die1, rolls[r].die2);
    bool pass = plays.empty();
    if (pass) {
      local.push_back(expand(flipped(board), depth - 1));
    } else {
      for (const Play& play : plays) {
        Probs exact;
        if (terminalForMover(play.result, exact)) {
          exact_.push_back(flipProbs(exact));
          local.push_back(Ref{Kind::Exact, static_cast<int32_t>(exact_.size() - 1)});
        } else {
          local.push_back(expand(flipped(play.result), depth - 1));
        }
      }
    }
    // Children are appended after the recursion so each roll's block stays contiguous.
    RollEntry& entry = rolls_[rollBegin + r];
    entry.childBegin = static_cast<int32_t>(children_.size());
    children_.insert(children_.end(), local.begin(), local.end());
    entry.childEnd = static_cast<int32_t>(children_.size());
    entry.pass = pass;
  }
  return Ref{Kind::Node, node};
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
    for (int32_t c = entry.childBegin; c < entry.childEnd; c++) {
      const Probs v = flipProbs(value(children_[c]));  // mover's point of view
      const double e = v.equity();
      if (c == entry.childBegin || e > bestEquity) {
        best = v;
        bestEquity = e;
      }
    }
    for (int k = 0; k < 5; k++) sum[k] += rolls[r].weight * best.p[k];
  }
  Probs out;
  for (int k = 0; k < 5; k++) out.p[k] = static_cast<float>(sum[k]);
  return out;
}

std::vector<Probs> Search::evaluate(const std::vector<Board>& boards, int depth) {
  stats_ = SearchStats{};
  leafBoards_.clear();
  leafValues_.clear();
  leafIndex_.clear();
  nodes_.clear();
  rolls_.clear();
  children_.clear();
  exact_.clear();

  std::vector<Ref> roots;
  roots.reserve(boards.size());
  for (const Board& b : boards) roots.push_back(expand(b, depth));

  stats_.leaves = static_cast<int64_t>(leafBoards_.size());
  leafValues_.resize(leafBoards_.size());
  constexpr size_t kChunk = 1 << 16;  // rows per net call
  std::vector<float> features;
  std::vector<float> out;
  for (size_t begin = 0; begin < leafBoards_.size(); begin += kChunk) {
    const size_t n = std::min(kChunk, leafBoards_.size() - begin);
    features.resize(n * kFeatureSize);
    out.resize(n * 5);
    for (size_t i = 0; i < n; i++) featurize(leafBoards_[begin + i], features.data() + i * kFeatureSize);
    net_.infer(features.data(), static_cast<int>(n), out.data());
    for (size_t i = 0; i < n; i++) std::memcpy(leafValues_[begin + i].p, out.data() + i * 5, sizeof(float) * 5);
  }

  std::vector<Probs> values;
  values.reserve(roots.size());
  for (const Ref& r : roots) values.push_back(value(r));
  return values;
}

}  // namespace bg
