#pragma once
#include <cstdint>
#include <vector>

#include "board.hpp"

namespace bg {

// One checker step in STM numbering: from 1..24 or kBar, to 1..24 or kOff.
struct Step {
  int8_t from;
  int8_t to;
};

struct Play {
  Step steps[4];
  uint8_t count;
  Board result;  // after the play; `me` is still the mover (not flipped)
};

// All legal plays for the side to move, one per distinct resulting board, into `out` (cleared
// first). Maximal number of dice used; if only one die of a non-double can be used, the higher one
// when possible. Empty when the player cannot move (dances). Reuses thread-local scratch, so
// repeated calls do not allocate once `out` has grown.
void legalPlays(const Board& board, int die1, int die2, std::vector<Play>& out);

// Convenience wrapper that returns a fresh vector.
std::vector<Play> legalPlays(const Board& board, int die1, int die2);

// 64-bit hash of a board (all 52 bytes).
uint64_t boardHash(const Board& b);

}  // namespace bg
