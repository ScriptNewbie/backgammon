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
// Runs in rounds: expand, evaluate all new leaves in one batch, apply the filters that were
// waiting on those values, expand the survivors, repeat. Then back up.
//
// Each round's work is split into chunks run on a thread pool. A chunk builds into its own
// Store (private arena with its own leaf dedupe); the stores are then appended to the global tree
// in chunk order, so the tree and the result do not depend on thread count or timing.
#include <atomic>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

#include "board.hpp"
#include "movegen.hpp"
#include "onnx_mlp.hpp"
#include "thread_pool.hpp"

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
  int64_t leaves = 0;      // boards sent to the net (deduplicated within each chunk)
  int64_t leafVisits = 0;  // leaf references before deduplication
  int64_t rounds = 0;      // net batches (filter rounds)
  int threads = 1;
  double expandMs = 0;     // move generation + tree building + filtering (parallel)
  double mergeMs = 0;      // appending chunk stores to the tree (offsets serial, copies parallel)
  double netMs = 0;        // net calls: copy boards, featurize + forward on the GPU, copy results
  double backupMs = 0;
};

// Deepest search the per-depth scratch supports.
constexpr int kMaxDepth = 8;

// The search would need more leaf visits than its budget allows (memory guard). Nothing is
// returned; callers should use a lower ply.
class SearchTooLarge : public std::runtime_error {
 public:
  explicit SearchTooLarge(int64_t limit)
      : std::runtime_error("search too large: more than " + std::to_string(limit) +
                           " leaf positions; use a lower ply"),
        limit_(limit) {}
  int64_t limit() const { return limit_; }

 private:
  int64_t limit_;
};

// Leaf-visit budget per Search: SEARCH_MAX_LEAF_VISITS, else 80M (about 9 GB at ~113 bytes per
// visit, measured at 4-ply on an RTX 5070 box).
int64_t defaultMaxLeafVisits();

class Search {
 public:
  explicit Search(Net& net, MoveFilter inner = kInnerFilter, ThreadPool* pool = &ThreadPool::shared(),
                  int64_t maxLeafVisits = defaultMaxLeafVisits())
      : net_(net), inner_(inner), pool_(*pool), budget_{maxLeafVisits} {}

  // Values of `boards` (each: side to move about to roll), searched `depth` plies, from that
  // side's point of view. Stats accumulate over calls on the same Search. Throws SearchTooLarge
  // once the leaf visits of this Search pass its budget.
  std::vector<Probs> evaluate(const std::vector<Board>& boards, int depth);

  const SearchStats& stats() const { return stats_; }

 private:
  enum class Kind : uint8_t { Leaf, Node, Exact };
  struct Ref {
    int32_t index;  // into leaves, nodes, or exact
    Kind kind;
  };
  struct Child {
    int32_t index;   // Ref of the child, from the CHILD's side-to-move point of view
    Kind kind;
    uint8_t active;  // 0 once the filter drops it
    Ref ref() const { return Ref{index, kind}; }
  };
  struct RollEntry {
    int32_t childBegin;  // children[childBegin, childEnd): one per legal play, or one pass
    int32_t childEnd;
    int8_t childDepth;   // depth the children are searched at
  };
  struct Node {
    int32_t rollBegin;  // rolls[rollBegin, rollBegin + 21)
  };
  // Shared by all chunks of one Search. Chunks add their leaf visits in batches.
  struct Budget {
    int64_t limit;
    std::atomic<int64_t> used{0};
    std::atomic<bool> exceeded{false};
  };
  // A global child whose provisional leaf a chunk replaced with a deeper subtree.
  struct Fixup {
    int32_t child;  // global index
    Ref ref;        // in the chunk's store
  };

  struct Store {
    std::vector<Board> leafBoards;
    std::vector<uint64_t> leafHashes;
    std::vector<int32_t> table;  // open addressing over leaf indices, -1 = empty
    std::vector<Node> nodes;
    std::vector<RollEntry> rolls;
    std::vector<Child> children;
    std::vector<Probs> exact;
    std::vector<int32_t> pending;  // roll entries waiting for 0-ply values to filter
    std::vector<Fixup> fixups;
    std::vector<Ref> roots;
    int64_t nodesExpanded = 0;
    int64_t leafVisits = 0;
    Budget* budget = nullptr;  // set before each round
    int64_t unreported = 0;    // leaf visits not yet added to budget->used
    std::vector<Play> plays[kMaxDepth + 1];   // move-gen scratch per depth (expand recurses)
    std::vector<Child> local[kMaxDepth + 1];  // children of one roll, per depth

    void clear();
    Ref leaf(const Board& board);
    Ref expand(const Board& board, int depth);

    // Add unreported visits to the shared budget; true once it is exceeded.
    bool overBudget();

   private:
    void growTable();
  };

  void filterEntry(int32_t entry, Store& chunk);
  void mergeChunks(int chunks, std::vector<Ref>* roots);
  // Run `items` work items in chunks on the pool, then merge the chunk stores in order.
  void parallelRound(int items, const std::function<void(int item, Store& chunk)>& work, std::vector<Ref>* roots);
  void flushLeaves();
  Probs value(const Ref& ref) const;

  Net& net_;
  MoveFilter inner_;
  ThreadPool& pool_;
  Budget budget_;
  SearchStats stats_;
  Store tree_;                      // global tree (its table and fixups are unused)
  std::vector<Probs> leafValues_;   // valid for [0, leafValues_.size())
  std::vector<Store> chunks_;
};

}  // namespace bg
