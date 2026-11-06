#pragma once
// Batched expectimax over dice with gnubg-style move filters (GnuBG ply numbering,
// docs/domain/game-engine-fast.md).
//
// value(B, 0) = net(B)                                  B: side to move is about to roll
// value(B, d) = Σ_roll w(roll) · best play of that roll  (w = 1/36 doubles, 2/36 otherwise)
//   d = 1: best play by the 0-ply value of its resulting position (all plays are leaves).
//   d ≥ 2: rank the plays by 0-ply, keep the inner filter's survivors, search those at d - 1,
//          and take the best of the survivors. Filtered-out plays never take part.
//   "Best" = highest cubeless money equity for the mover. Game-ending plays use exact probs;
//   a roll with no legal play passes the turn. Probabilities (not equity) are averaged.
//
// Runs in rounds: expand, evaluate all pending leaves in one batch (deduplicated), apply the
// filters that were waiting on those values, expand the survivors, repeat. Then back up.
#include <cstdint>
#include <unordered_map>
#include <vector>

#include "board.hpp"
#include "onnx_mlp.hpp"

namespace bg {

// Cubeless outcome probabilities for the side to move: win, gammon, backgammon, loseGammon,
// loseBackgammon (docs/domain/evaluation.md order).
struct Probs {
  float p[5];
  double equity() const { return p[0] + p[1] + p[2] - ((1.0 - p[0]) + p[3] + p[4]); }
};

// Same position seen from the other player.
inline Probs flipProbs(const Probs& x) {
  return Probs{{1.0f - x.p[0], x.p[3], x.p[4], x.p[1], x.p[2]}};
}

// Exact probs for the player who just finished the game (`me` in `b`), or false if still in play.
bool terminalForMover(const Board& b, Probs& out);

struct Roll {
  int die1;
  int die2;
  float weight;
};
// The 21 distinct rolls with their probabilities (sum to 1).
const std::vector<Roll>& allRolls();

// Keep the best candidate, then more (up to maxKeep in total) whose 0-ply equity is within
// `threshold` of the best.
struct MoveFilter {
  int maxKeep;
  double threshold;
};
// Engine defaults. Root: which plays are searched to full depth at ply >= 2 (gnubg: 8 within
// 0.16). Inner: replies kept per roll at depth >= 2 (gnubg picks the single 0-ply best).
constexpr MoveFilter kRootFilter{8, 0.16};
constexpr MoveFilter kInnerFilter{1, 0.0};

// Indices of `equities` (higher is better) that pass `filter`, best first.
std::vector<int> applyFilter(const std::vector<double>& equities, const MoveFilter& filter);

struct SearchStats {
  int64_t nodes = 0;       // positions expanded over all 21 rolls
  int64_t leaves = 0;      // distinct boards sent to the net
  int64_t leafVisits = 0;  // leaf references before deduplication
  int64_t rounds = 0;      // net batches (filter rounds)
};

class Search {
 public:
  explicit Search(Net& net, MoveFilter inner = kInnerFilter) : net_(net), inner_(inner) {}

  // Values of `boards` (each: side to move about to roll), searched `depth` plies, from that
  // side's point of view. Stats accumulate over calls on the same Search.
  std::vector<Probs> evaluate(const std::vector<Board>& boards, int depth);

  const SearchStats& stats() const { return stats_; }

 private:
  enum class Kind : uint8_t { Leaf, Node, Exact };
  struct Ref {
    Kind kind;
    int32_t index;  // into leaves_, nodes_, or exact_
  };
  struct Child {
    Ref ref;       // from the CHILD's side-to-move point of view
    Board board;   // child position (opponent to roll), kept for expansion after filtering
    bool active;   // false once the filter drops it
  };
  struct RollEntry {
    int32_t childBegin;  // children_[childBegin, childEnd): one per legal play, or one pass
    int32_t childEnd;
    int8_t childDepth;   // depth the children are searched at
  };
  struct Node {
    int32_t rollBegin;  // rolls_[rollBegin, rollBegin + 21)
  };
  struct BoardHash {
    size_t operator()(const Board& b) const;
  };
  struct BoardEq {
    bool operator()(const Board& a, const Board& b) const { return sameBoard(a, b); }
  };

  Ref expand(const Board& board, int depth);
  Ref leaf(const Board& board);
  void flushLeaves();
  void filterEntry(int32_t entry);
  Probs value(const Ref& ref) const;

  Net& net_;
  MoveFilter inner_;
  SearchStats stats_;
  std::vector<Board> leafBoards_;
  std::vector<Probs> leafValues_;  // valid for [0, leafValues_.size())
  std::unordered_map<Board, int32_t, BoardHash, BoardEq> leafIndex_;
  std::vector<Node> nodes_;
  std::vector<RollEntry> rolls_;
  std::vector<Child> children_;
  std::vector<Probs> exact_;
  std::vector<int32_t> pending_;  // roll entries waiting for 0-ply values to filter
};

}  // namespace bg
