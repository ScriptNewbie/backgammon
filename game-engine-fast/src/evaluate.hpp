#pragma once
// POST /evaluate body → response (docs/domain/game-engine-fast.md).
#include <nlohmann/json.hpp>

#include "onnx_mlp.hpp"
#include "position_json.hpp"

namespace bg {

constexpr int kMaxPly = 4;

struct Cubeless {
  double win, gammon, backgammon, loseGammon, loseBackgammon;
  double equity() const { return win + gammon + backgammon - ((1 - win) + loseGammon + loseBackgammon); }
};

// Exact probs for the STM of a finished position, given how the previous mover won.
Cubeless terminalCubelessForLoser(Result moverWon);

// 0-ply: every legal play, eval of the resulting position (opponent is STM), sorted best-first for
// the mover by negated cubefulEquity, ties by stepsKey. `ply` > 0 is not implemented yet.
nlohmann::ordered_json evaluate(const EvalRequest& req, int ply, Net& net);

}  // namespace bg
