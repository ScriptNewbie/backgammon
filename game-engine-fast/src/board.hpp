#pragma once
// Side-to-move relative board. Plain data, no allocation, usable from CUDA kernels later.
#include <cstdint>

#if defined(__CUDACC__)
#define BG_HD __host__ __device__
#else
#define BG_HD
#endif

namespace bg {

constexpr int kOff = 0;   // borne-off slot
constexpr int kBar = 25;  // bar slot
constexpr int kSlots = 26;
constexpr int kCheckers = 15;

// `me` is the side to move, `opp` the other player. Each array is in that player's OWN numbering:
// 1..24 = points (1 = own 1-point, bearing off toward 0), 0 = borne off, 25 = bar.
// My point p is the opponent's point 25 - p.
struct Board {
  uint8_t me[kSlots];
  uint8_t opp[kSlots];
};

BG_HD inline Board flipped(const Board& b) {
  Board r;
  for (int i = 0; i < kSlots; i++) {
    r.me[i] = b.opp[i];
    r.opp[i] = b.me[i];
  }
  return r;
}

BG_HD inline bool sameBoard(const Board& a, const Board& b) {
  for (int i = 0; i < kSlots; i++) {
    if (a.me[i] != b.me[i] || a.opp[i] != b.opp[i]) return false;
  }
  return true;
}

enum class Result : uint8_t { None, Single, Gammon, Backgammon };

// Result for the player in `me` (call right after that player's play, before flipping).
// Gammon/backgammon follow docs/domain/evaluation.md: backgammon if the loser still has a
// checker on the bar or in the winner's home board (loser's own points 19..24).
BG_HD inline Result moverResult(const Board& b) {
  if (b.me[kOff] < kCheckers) return Result::None;
  if (b.opp[kOff] > 0) return Result::Single;
  for (int i = 19; i <= kBar; i++) {
    if (b.opp[i] > 0) return Result::Backgammon;
  }
  return Result::Gammon;
}

}  // namespace bg
