#pragma once
// Position JSON (docs/domain/board-representation.md) ↔ STM board, and steps back to JSON.
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "board.hpp"
#include "movegen.hpp"

namespace bg {

enum class Player : uint8_t { P1, P2 };

struct EvalRequest {
  Board board;  // STM = onRoll
  Player onRoll;
  int die1;  // 0 for /cube (dice null)
  int die2;
  int cubeValue;
  bool mayDouble[2];  // [p1, p2]
  bool hasMatch;      // false: money (`match` null)
  int matchLength;
  int score[2];  // [p1, p2]
  bool crawford;
};

// POST /evaluate: validates like game-engine's parseEvaluateBody (dice required); throws
// std::invalid_argument with the reason.
EvalRequest parseEvalRequest(const nlohmann::json& body);
// POST /cube: the same, but `dice` must be null (the doubler is on roll before the roll).
EvalRequest parseCubeRequest(const nlohmann::json& body);

// STM-numbered point → JSON point (1..24) for the player on roll.
inline int toJsonPoint(Player onRoll, int stmPoint) {
  return onRoll == Player::P1 ? stmPoint : 25 - stmPoint;
}

nlohmann::ordered_json stepToJson(Player onRoll, const Step& step);

// game-engine's stepsKey: "from/to from/to" in JSON numbering.
std::string stepsKey(Player onRoll, const Step* steps, int count);

inline const char* playerName(Player p) { return p == Player::P1 ? "p1" : "p2"; }

}  // namespace bg
