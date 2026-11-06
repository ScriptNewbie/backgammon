#pragma once
// POST /evaluate body → response (docs/domain/game-engine-fast.md).
#include <nlohmann/json.hpp>

#include "onnx_mlp.hpp"
#include "position_json.hpp"
#include "search.hpp"

namespace bg {

// Highest ply the API accepts (ADR 0028). Values above kMaxSearchPly are "not implemented yet".
constexpr int kMaxPly = 4;
// Highest ply the search runs today: full width, no move filter.
constexpr int kMaxSearchPly = 1;

struct Cubeless {
  double win, gammon, backgammon, loseGammon, loseBackgammon;
  double equity() const { return win + gammon + backgammon - ((1 - win) + loseGammon + loseBackgammon); }
};

// Exact probs for the STM of a finished position, given how the previous mover won.
Cubeless terminalCubelessForLoser(Result moverWon);

// Every legal play with the eval of the resulting position (opponent is STM), searched `ply`
// plies; sorted best-first for the mover by negated cubefulEquity, ties by stepsKey.
// Throws std::invalid_argument for ply above kMaxSearchPly. `stats` (optional) gets search counts.
nlohmann::ordered_json evaluate(const EvalRequest& req, int ply, Net& net, SearchStats* stats = nullptr);

}  // namespace bg
