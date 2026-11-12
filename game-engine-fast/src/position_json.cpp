#include "position_json.hpp"

#include <cmath>

namespace bg {
namespace {

using nlohmann::json;

[[noreturn]] void fail(const std::string& message) { throw std::invalid_argument(message); }

// JSON number that is an integer in [min, max] (2.0 counts, like JS Number.isInteger).
bool intIn(const json& v, int min, int max, int& out) {
  if (!v.is_number()) return false;
  const double d = v.get<double>();
  if (!std::isfinite(d) || std::floor(d) != d || d < min || d > max) return false;
  out = static_cast<int>(d);
  return true;
}

bool isString(const json& v, const char* s) { return v.is_string() && v.get_ref<const std::string&>() == s; }

bool isPlayer(const json& v) { return isString(v, "p1") || isString(v, "p2"); }

void counts(const json& body, const char* label, int& p1, int& p2) {
  if (!body.contains(label) || !body[label].is_object()) fail(std::string(label) + " required");
  const json& o = body[label];
  if (!o.contains("p1") || !o.contains("p2") || !intIn(o["p1"], 0, 15, p1) ||
      !intIn(o["p2"], 0, 15, p2)) {
    fail(std::string(label) + ".p1 and " + label + ".p2 must be integers 0-15");
  }
}

void validateCube(const json& body, int& value, bool mayDouble[2]) {
  if (!body.contains("cube") || !body["cube"].is_object()) fail("cube required");
  const json& cube = body["cube"];
  int v = 0;
  if (!cube.contains("value") || !intIn(cube["value"], 1, 64, v) || (v & (v - 1)) != 0) {
    fail("cube.value must be 1, 2, 4, 8, 16, 32, or 64");
  }
  value = v;
  if (!cube.contains("owner") || !(isString(cube["owner"], "centered") || isPlayer(cube["owner"]))) {
    fail("cube.owner must be centered, p1, or p2");
  }
  if (!cube.contains("mayDouble") || !cube["mayDouble"].is_object()) fail("cube.mayDouble required");
  const json& may = cube["mayDouble"];
  if (!may.contains("p1") || !may.contains("p2") || !may["p1"].is_boolean() ||
      !may["p2"].is_boolean()) {
    fail("cube.mayDouble.p1/p2 must be boolean");
  }
  mayDouble[0] = may["p1"].get<bool>();
  mayDouble[1] = may["p2"].get<bool>();
}

void validateMatch(const json& body, EvalRequest& req) {
  if (!body.contains("match")) fail("match must be an object or null");
  const json& match = body["match"];
  req.hasMatch = false;
  if (match.is_null()) return;
  if (!match.is_object()) fail("match must be an object or null");
  int length = 0, s1 = 0, s2 = 0;
  if (!match.contains("length") || !intIn(match["length"], 1, 15, length)) {
    fail("match.length must be a positive integer");
  }
  if (!match.contains("score") || !match["score"].is_object()) fail("match.score required");
  const json& score = match["score"];
  if (!score.contains("p1") || !score.contains("p2") || !intIn(score["p1"], 0, length, s1) ||
      !intIn(score["p2"], 0, length, s2)) {
    fail("match.score.p1/p2 must be integers");
  }
  if (!match.contains("crawford") || !match["crawford"].is_boolean()) {
    fail("match.crawford must be boolean");
  }
  req.hasMatch = true;
  req.matchLength = length;
  req.score[0] = s1;
  req.score[1] = s2;
  req.crawford = match["crawford"].get<bool>();
}

}  // namespace

static EvalRequest parseRequest(const json& body, bool withDice) {
  if (!body.is_object()) fail("position object required");
  if (!body.contains("points") || !body["points"].is_array() || body["points"].size() != 24) {
    fail("points must be length 24");
  }
  int points[24];
  for (int i = 0; i < 24; i++) {
    if (!intIn(body["points"][i], -15, 15, points[i])) {
      fail("points[" + std::to_string(i) + "] must be an integer -15..15");
    }
  }
  if (!body.contains("onRoll") || !isPlayer(body["onRoll"])) fail("onRoll must be p1 or p2");
  const Player onRoll = isString(body["onRoll"], "p1") ? Player::P1 : Player::P2;

  EvalRequest req{};
  if (withDice) {
    if (!body.contains("dice") || !body["dice"].is_array() || body["dice"].size() != 2 ||
        !intIn(body["dice"][0], 1, 6, req.die1) || !intIn(body["dice"][1], 1, 6, req.die2)) {
      fail("dice must be two ints 1-6");
    }
  } else if (!body.contains("dice") || !body["dice"].is_null()) {
    fail("dice must be null (cube decisions are made before the roll)");
  }
  validateCube(body, req.cubeValue, req.mayDouble);
  validateMatch(body, req);
  int bar1, bar2, off1, off2;
  counts(body, "bar", bar1, bar2);
  counts(body, "off", off1, off2);

  int n1 = bar1 + off1, n2 = bar2 + off2;
  for (int v : points) {
    if (v > 0) n1 += v;
    if (v < 0) n2 -= v;
  }
  if (n1 != 15 || n2 != 15) {
    fail("checker counts must be 15 (p1=" + std::to_string(n1) + " p2=" + std::to_string(n2) + ")");
  }

  // p1 owns positive counts; JSON point P is p1's point P and p2's point 25 - P.
  Board p1{}, p2{};
  for (int i = 0; i < 24; i++) {
    const int jsonPoint = i + 1;
    if (points[i] > 0) p1.me[jsonPoint] = static_cast<uint8_t>(points[i]);
    if (points[i] < 0) p2.me[25 - jsonPoint] = static_cast<uint8_t>(-points[i]);
  }
  p1.me[kBar] = static_cast<uint8_t>(bar1);
  p1.me[kOff] = static_cast<uint8_t>(off1);
  p2.me[kBar] = static_cast<uint8_t>(bar2);
  p2.me[kOff] = static_cast<uint8_t>(off2);

  const Board& stm = onRoll == Player::P1 ? p1 : p2;
  const Board& other = onRoll == Player::P1 ? p2 : p1;
  for (int i = 0; i < kSlots; i++) {
    req.board.me[i] = stm.me[i];
    req.board.opp[i] = other.me[i];
  }
  req.onRoll = onRoll;
  return req;
}

EvalRequest parseEvalRequest(const json& body) { return parseRequest(body, true); }

EvalRequest parseCubeRequest(const json& body) { return parseRequest(body, false); }

nlohmann::ordered_json stepToJson(Player onRoll, const Step& step) {
  nlohmann::ordered_json j;
  if (step.from == kBar) {
    j["from"] = "bar";
  } else {
    j["from"] = toJsonPoint(onRoll, step.from);
  }
  if (step.to == kOff) {
    j["to"] = "off";
  } else {
    j["to"] = toJsonPoint(onRoll, step.to);
  }
  return j;
}

std::string stepsKey(Player onRoll, const Step* steps, int count) {
  std::string key;
  for (int i = 0; i < count; i++) {
    if (i > 0) key += ' ';
    key += steps[i].from == kBar ? std::string("bar") : std::to_string(toJsonPoint(onRoll, steps[i].from));
    key += '/';
    key += steps[i].to == kOff ? std::string("off") : std::to_string(toJsonPoint(onRoll, steps[i].to));
  }
  return key;
}

}  // namespace bg
