#pragma once
// Test helpers. Expected results are written as JSON step strings ("13/8", "bar/22", "3/off")
// and applied here in absolute JSON coordinates, independently of the engine's STM board.
#include <algorithm>
#include <set>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "movegen.hpp"
#include "position_json.hpp"

namespace bgtest {

// Absolute position as in position JSON: points[i] is JSON point i + 1, positive = p1.
struct Abs {
  int points[24] = {};
  int bar1 = 0, bar2 = 0, off1 = 0, off2 = 0;

  std::string str() const {
    std::ostringstream s;
    for (int v : points) s << v << ',';
    s << '|' << bar1 << ',' << bar2 << '|' << off1 << ',' << off2;
    return s.str();
  }
};

// Build a position: `pts` are {jsonPoint, signedCount}; bar/off fill the rest of each side.
inline Abs pos(std::vector<std::pair<int, int>> pts, int bar1, int bar2, int off1, int off2) {
  Abs a;
  for (auto [p, n] : pts) a.points[p - 1] = n;
  a.bar1 = bar1;
  a.bar2 = bar2;
  a.off1 = off1;
  a.off2 = off2;
  return a;
}

inline nlohmann::json toJson(const Abs& a, const char* onRoll, int d1, int d2, int cubeValue = 1) {
  nlohmann::json j;
  j["points"] = std::vector<int>(a.points, a.points + 24);
  j["bar"] = {{"p1", a.bar1}, {"p2", a.bar2}};
  j["off"] = {{"p1", a.off1}, {"p2", a.off2}};
  j["onRoll"] = onRoll;
  j["dice"] = {d1, d2};
  j["cube"] = {{"value", cubeValue}, {"owner", "centered"}, {"mayDouble", {{"p1", true}, {"p2", true}}}};
  j["match"] = nullptr;
  return j;
}

// Apply "from/to" steps for `onRoll` in JSON coordinates. Hitting a lone opposing checker sends it
// to the bar.
inline Abs applySteps(Abs a, const std::string& onRoll, const std::string& play) {
  const bool p1 = onRoll == "p1";
  std::istringstream in(play);
  std::string step;
  while (in >> step) {
    const auto slash = step.find('/');
    const std::string from = step.substr(0, slash), to = step.substr(slash + 1);
    if (from == "bar") {
      (p1 ? a.bar1 : a.bar2)--;
    } else {
      a.points[std::stoi(from) - 1] -= p1 ? 1 : -1;
    }
    if (to == "off") {
      (p1 ? a.off1 : a.off2)++;
    } else {
      int& v = a.points[std::stoi(to) - 1];
      if (p1 && v == -1) {
        v = 0;
        a.bar2++;
      } else if (!p1 && v == 1) {
        v = 0;
        a.bar1++;
      }
      v += p1 ? 1 : -1;
    }
  }
  return a;
}

// Engine play result (STM board, mover = me) → absolute JSON position.
inline Abs resultToAbs(const bg::Board& b, bg::Player onRoll) {
  const bg::Board& p1 = onRoll == bg::Player::P1 ? b : bg::flipped(b);
  Abs a;
  for (int p = 1; p <= 24; p++) {
    // p1's point p is JSON point p; p2's own point q is JSON point 25 - q.
    a.points[p - 1] += p1.me[p];
    a.points[(25 - p) - 1] -= p1.opp[p];
  }
  a.bar1 = p1.me[bg::kBar];
  a.off1 = p1.me[bg::kOff];
  a.bar2 = p1.opp[bg::kBar];
  a.off2 = p1.opp[bg::kOff];
  return a;
}

inline std::set<std::string> resultSet(const Abs& start, const char* onRoll, int d1, int d2) {
  const bg::EvalRequest req = bg::parseEvalRequest(toJson(start, onRoll, d1, d2));
  std::set<std::string> out;
  for (const bg::Play& play : bg::legalPlays(req.board, d1, d2)) out.insert(resultToAbs(play.result, req.onRoll).str());
  return out;
}

inline std::set<std::string> expectedSet(const Abs& start, const char* onRoll, std::vector<std::string> plays) {
  std::set<std::string> out;
  for (const std::string& play : plays) out.insert(applySteps(start, onRoll, play).str());
  return out;
}

}  // namespace bgtest
