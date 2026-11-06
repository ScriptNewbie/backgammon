#pragma once
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

// All legal plays for the side to move, one per distinct resulting board.
// Maximal number of dice used; if only one die of a non-double can be used, the higher one
// when possible. Empty when the player cannot move (dances).
std::vector<Play> legalPlays(const Board& board, int die1, int die2);

}  // namespace bg
