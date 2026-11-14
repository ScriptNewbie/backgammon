#include "match.hpp"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <mutex>
#include <sstream>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace bg {
namespace {

double clamp01(double x) { return std::min(1.0, std::max(0.0, x)); }

std::map<int, double> keyed(const nlohmann::json& o) {
  std::map<int, double> out;
  for (auto it = o.begin(); it != o.end(); ++it) out[std::stoi(it.key())] = it.value().get<double>();
  return out;
}

}  // namespace

double Met::equity(int stmAway, int oppAway, Phase phase) const {
  if (stmAway <= 0) return 1;
  if (oppAway <= 0) return 0;
  if (phase == Phase::Post) {
    const auto& table = stmAway == 1 ? postCrawfordLeader : postCrawfordTrailer;
    const int key = stmAway == 1 ? oppAway : stmAway;
    const auto it = table.find(key);
    if (it == table.end()) throw std::runtime_error("MET has no post-Crawford entry for " + std::to_string(key));
    return it->second;
  }
  if (stmAway > static_cast<int>(crawford.size()) || oppAway > static_cast<int>(crawford[stmAway - 1].size())) {
    throw std::runtime_error("MET has no entry for " + std::to_string(stmAway) + "/" + std::to_string(oppAway));
  }
  return crawford[stmAway - 1][oppAway - 1];
}

Met parseMet(const std::string& text) {
  const nlohmann::json j = nlohmann::json::parse(text);
  Met m;
  m.crawford = j.at("crawford").get<std::vector<std::vector<double>>>();
  m.postCrawfordLeader = keyed(j.at("postCrawfordLeader"));
  m.postCrawfordTrailer = keyed(j.at("postCrawfordTrailer"));
  if (m.crawford.size() < 15) throw std::runtime_error("MET must cover 15-away");
  return m;
}

const Met& met() {
  static std::once_flag once;
  static Met loaded;
  std::call_once(once, [] {
    const char* env = std::getenv("MET_PATH");
    const std::string path = env && *env ? env : "/repo/docs/domain/data/kazaross-xg2-met.json";
    std::ifstream in(path);
    if (!in) throw std::runtime_error("cannot read MET " + path + " (set MET_PATH)");
    std::stringstream s;
    s << in.rdbuf();
    loaded = parseMet(s.str());
  });
  return loaded;
}

Phase matchPhase(int length, int scoreA, int scoreB, bool crawford) {
  if (crawford) return Phase::Crawford;
  if (scoreA == length - 1 || scoreB == length - 1) return Phase::Post;
  return Phase::Pre;
}

double deadCubeMwc(const Cubeless& c, const MatchView& me, int cubeValue, Phase phase) {
  const Met& table = met();
  const int C = cubeValue;
  auto after = [&](int myPts, int oppPts) {
    return table.equity(me.length - (me.myScore + myPts), me.length - (me.oppScore + oppPts), phase);
  };
  const double lose = clamp01(1 - c.win);
  return clamp01(c.win - c.gammon) * after(C, 0) + clamp01(c.gammon - c.backgammon) * after(2 * C, 0) +
         clamp01(c.backgammon) * after(3 * C, 0) + clamp01(lose - c.loseGammon) * after(0, C) +
         clamp01(c.loseGammon - c.loseBackgammon) * after(0, 2 * C) + clamp01(c.loseBackgammon) * after(0, 3 * C);
}

CubeVerdict decideCube(const Cubeless& doubler, const MatchView& v, int cubeValue, Phase phase) {
  CubeVerdict out{};
  out.noDouble = deadCubeMwc(doubler, v, cubeValue, phase);
  out.doubleTake = deadCubeMwc(doubler, v, 2 * cubeValue, phase);
  out.doubleDrop = met().equity(v.length - (v.myScore + cubeValue), v.length - v.oppScore, phase);
  const bool wouldDrop = (1 - out.doubleTake) < (1 - out.doubleDrop);
  const bool tooGood = out.noDouble > out.doubleTake;
  const double offerValue = wouldDrop ? out.doubleDrop : out.doubleTake;
  out.doubles = !tooGood && offerValue > out.noDouble;
  out.takes = !wouldDrop;
  return out;
}

}  // namespace bg

namespace bg {
namespace {

// Fully live-cube equity at cube 1, piecewise linear in p between the take and cash points.
double liveEquity(const Cubeless& c, CubeView view) {
  const double p = clamp01(c.win);
  const double lose = 1 - p;
  const double W = p > 0 ? (c.win + c.gammon + c.backgammon) / c.win : 1;
  const double L = lose > 0 ? (lose + c.loseGammon + c.loseBackgammon) / lose : 1;
  const double tp = (L - 0.5) / (W + L + 0.5);
  const double cp = (L + 1) / (W + L + 0.5);
  auto above = [&](double from, double at) { return from + (W - from) * ((p - at) / (1 - at)); };
  if (view == CubeView::Mine) return p < cp ? -L + (L + 1) * (p / cp) : above(1, cp);
  if (view == CubeView::Theirs) return p < tp ? -L + (L - 1) * (p / tp) : above(-1, tp);
  if (p < tp) return -L + (L - 1) * (p / tp);
  if (p <= cp) return -1 + 2 * ((p - tp) / (cp - tp));
  return above(1, cp);
}

}  // namespace

double moneyCubeful(const Cubeless& c, CubeView view, int cubeValue, double x) {
  const double dead = c.equity();
  if (view == CubeView::Dead) return dead * cubeValue;
  return cubeValue * ((1 - x) * dead + x * liveEquity(c, view));
}

CubeVerdict decideMoneyCube(const Cubeless& doubler, CubeView view, int cubeValue) {
  CubeVerdict out{};
  out.noDouble = moneyCubeful(doubler, view, cubeValue);
  const int doubled = 2 * cubeValue;
  out.doubleTake = moneyCubeful(doubler, doubled >= 64 ? CubeView::Dead : CubeView::Theirs, doubled);
  out.doubleDrop = cubeValue;
  out.doubles = std::min(out.doubleTake, out.doubleDrop) > out.noDouble;
  out.takes = out.doubleTake < out.doubleDrop;
  return out;
}

}  // namespace bg
