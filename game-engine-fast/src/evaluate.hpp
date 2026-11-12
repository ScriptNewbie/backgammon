#pragma once
// POST /evaluate and POST /cube bodies → responses (docs/domain/game-engine-fast.md).
#include <nlohmann/json.hpp>

#include "match.hpp"
#include "onnx_mlp.hpp"
#include "position_json.hpp"
#include "search.hpp"

namespace bg {

// Highest ply the API accepts (ADR 0028). Values above kMaxSearchPly are "not implemented yet".
constexpr int kMaxPly = 4;
// Highest ply the search runs (move filters: kRootFilter, kInnerFilter in search.hpp).
constexpr int kMaxSearchPly = 4;

// Exact probs for the STM of a finished position, given how the previous mover won.
Cubeless terminalCubelessForLoser(Result moverWon);

// Legal plays with the eval of the resulting position (opponent is STM), searched `ply` plies.
// ply 0-1: every play. ply >= 2: only plays that pass kRootFilter at 0-ply, plus game-ending plays.
// Sorted best-first for the mover at the match state (ADR 0032): mover dead-cube MWC when `match`
// is set, negated cubefulEquity for money; ties by stepsKey. moves[0] is the engine's play.
// Throws std::invalid_argument for ply above kMaxSearchPly. `stats` (optional) gets search counts.
nlohmann::ordered_json evaluate(const EvalRequest& req, int ply, Net& net, SearchStats* stats = nullptr);

// POST /cube (ADR 0032): the position (doubler on roll, no dice) searched `ply` plies, through the
// dead-cube formula. {available, offer, take, noDouble, doubleTake, doubleDrop, cubeless}, as
// game-engine. Not available (no offer, take null) for money, when the doubler may not double, or
// at cube 64.
nlohmann::ordered_json cubeDecision(const EvalRequest& req, int ply, Net& net, SearchStats* stats = nullptr);

}  // namespace bg
