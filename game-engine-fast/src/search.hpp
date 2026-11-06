#pragma once
// Batched expectimax over dice (GnuBG ply numbering, docs/domain/game-engine-fast.md).
//
// value(B, 0) = net(B)                                  B: side to move is about to roll
// value(B, d) = Σ_roll w(roll) · best play of that roll  (w = 1/36 doubles, 2/36 otherwise)
//   best play = the play whose resulting position, searched at d - 1 and seen from the mover,
//               has the highest cubeless money equity. Game-ending plays use exact probs;
//               a roll with no legal play passes the turn.
// Probabilities are averaged (not equity), all five outputs at once.
//
// All leaf boards of one call go to the net in one batch (deduplicated), then values are backed
// up through the stored tree. No move filter yet: every play is searched (full width).
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

struct SearchStats {
  int64_t nodes = 0;       // positions expanded over all 21 rolls
  int64_t leaves = 0;      // distinct boards sent to the net
  int64_t leafVisits = 0;  // leaf references before deduplication
};

class Search {
 public:
  explicit Search(Net& net) : net_(net) {}

  // Values of `boards` (each: side to move about to roll), searched `depth` plies, from that
  // side's point of view.
  std::vector<Probs> evaluate(const std::vector<Board>& boards, int depth);

  const SearchStats& stats() const { return stats_; }

 private:
  enum class Kind : uint8_t { Leaf, Node, Exact };
  struct Ref {
    Kind kind;
    int32_t index;  // into leaves_, nodes_, or exact_
  };
  struct RollEntry {
    int32_t childBegin;  // children_[childBegin, childEnd): one per legal play
    int32_t childEnd;
    bool pass;           // no legal play: single child is the same board, other side to roll
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
  Probs value(const Ref& ref) const;

  Net& net_;
  SearchStats stats_;
  std::vector<Board> leafBoards_;
  std::vector<Probs> leafValues_;
  std::unordered_map<Board, int32_t, BoardHash, BoardEq> leafIndex_;
  std::vector<Node> nodes_;
  std::vector<RollEntry> rolls_;
  std::vector<Ref> children_;
  std::vector<Probs> exact_;
};

}  // namespace bg
