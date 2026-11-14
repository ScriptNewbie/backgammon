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

namespace bg {
namespace {

struct Split {
  double single, gammon, backgammon;
};

Split splitOf(double total, double gammon, double backgammon) {
  if (total <= 0) return Split{1, 0, 0};
  const double g = std::max(0.0, gammon - backgammon) / total;
  const double b = std::max(0.0, backgammon) / total;
  return Split{std::max(0.0, 1 - g - b), g, b};
}

int levelOf(int cubeValue) {
  int level = 0;
  while ((1 << level) < cubeValue) level++;
  return level;
}

// The x on [x0, x1] where the line through (x0, y0) and (x1, y1) reaches y, clamped.
double solve(double y, double x0, double y0, double x1, double y1) {
  if (y1 == y0) return y <= y0 ? x0 : x1;
  const double t = std::min(1.0, std::max(0.0, (y - y0) / (y1 - y0)));
  return x0 + t * (x1 - x0);
}

// One evaluation: side 0 = the player whose probs these are, side 1 = the opponent.
class Live {
 public:
  Live(const MatchCubeTables::Side (&sides)[2], const Cubeless& c)
      : sides_(sides),
        wins_(splitOf(c.win, c.gammon, c.backgammon)),
        loses_(splitOf(1 - c.win, c.loseGammon, c.loseBackgammon)) {
    for (auto& row : tp_)
      for (double& v : row) v = -1;
  }

  double w(int s, int lv) const {
    const Split& sp = s == 0 ? wins_ : loses_;
    const double* m = sides_[s].win[lv];
    return sp.single * m[0] + sp.gammon * m[1] + sp.backgammon * m[2];
  }
  double l(int s, int lv) const {
    const Split& sp = s == 0 ? loses_ : wins_;
    const double* m = sides_[s].lose[lv];
    return sp.single * m[0] + sp.gammon * m[1] + sp.backgammon * m[2];
  }
  double cash(int s, int lv) const { return sides_[s].win[lv][0]; }
  double oppCash(int s, int lv) const { return sides_[s].lose[lv][0]; }

  // Side s owning cube level lv cashes at 1 - (the other side's take point at lv + 1).
  double cashPoint(int s, int lv) { return 1 - takePoint(1 - s, lv + 1); }

  double ownLive(int s, double q, int lv) {
    const double lo = l(s, lv), hi = w(s, lv);
    if (lv + 1 >= MatchCubeTables::kLevels) return lo + q * (hi - lo);
    const double cp = cashPoint(s, lv);
    const double c = cash(s, lv);
    if (q < cp) return lo + (c - lo) * (q / cp);
    return cp >= 1 ? c : c + (hi - c) * ((q - cp) / (1 - cp));
  }

  // Side s doubled to level lv (owns it): where owning it live equals dropping one level lower.
  double takePoint(int s, int lv) {
    double& memo = tp_[s][lv];
    if (memo >= 0) return memo;
    const double target = sides_[s].drop[lv];
    const double lo = l(s, lv), hi = w(s, lv);
    if (lv + 1 >= MatchCubeTables::kLevels) {
      memo = solve(target, 0, lo, 1, hi);
    } else {
      const double cp = cashPoint(s, lv);
      const double c = cash(s, lv);
      memo = target <= c ? solve(target, 0, lo, cp, c) : solve(target, cp, c, 1, hi);
    }
    return memo;
  }

  double live(double p, int lv, CubeView view) {
    if (view == CubeView::Mine) return ownLive(0, p, lv);
    if (view == CubeView::Theirs) return 1 - ownLive(1, 1 - p, lv);
    const double lo = l(0, lv), hi = w(0, lv);
    if (lv + 1 >= MatchCubeTables::kLevels) return lo + p * (hi - lo);
    const double tp = takePoint(0, lv + 1);
    const double cp = cashPoint(0, lv);
    if (tp >= cp) return lo + p * (hi - lo);
    const double oc = oppCash(0, lv), c = cash(0, lv);
    if (p < tp) return lo + (oc - lo) * (p / tp);
    if (p <= cp) return oc + (c - oc) * ((p - tp) / (cp - tp));
    return c + (hi - c) * ((p - cp) / (1 - cp));
  }

  double dead(double p, int lv) const { return (1 - p) * l(0, lv) + p * w(0, lv); }

 private:
  const MatchCubeTables::Side (&sides_)[2];
  Split wins_, loses_;
  double tp_[2][MatchCubeTables::kLevels];
};

}  // namespace

MatchCubeTables::MatchCubeTables(const MatchView& me, Phase phase) {
  const Met& table = met();
  for (int s = 0; s < 2; s++) {
    const int myScore = s == 0 ? me.myScore : me.oppScore;
    const int oppScore = s == 0 ? me.oppScore : me.myScore;
    auto after = [&](int myPts, int oppPts) {
      return table.equity(me.length - (myScore + myPts), me.length - (oppScore + oppPts), phase);
    };
    for (int lv = 0; lv < kLevels; lv++) {
      const int k = 1 << lv;
      for (int m = 0; m < 3; m++) {
        side_[s].win[lv][m] = after((m + 1) * k, 0);
        side_[s].lose[lv][m] = after(0, (m + 1) * k);
      }
      side_[s].drop[lv] = lv == 0 ? 0 : after(0, k / 2);
    }
  }
}

double MatchCubeTables::cubeful(const Cubeless& c, CubeView view, int cubeValue, double x) const {
  Live live(side_, c);
  const double p = std::min(1.0, std::max(0.0, c.win));
  const int lv = levelOf(cubeValue);
  const double dead = live.dead(p, lv);
  if (view == CubeView::Dead) return dead;
  return (1 - x) * dead + x * live.live(p, lv, view);
}

CubeVerdict MatchCubeTables::decide(const Cubeless& doubler, CubeView view, int cubeValue, double x) const {
  CubeVerdict out{};
  out.noDouble = cubeful(doubler, view, cubeValue, x);
  const int doubled = 2 * cubeValue;
  out.doubleTake = cubeful(doubler, doubled >= 64 ? CubeView::Dead : CubeView::Theirs, doubled, x);
  out.doubleDrop = side_[0].win[levelOf(cubeValue)][0];
  out.doubles = std::min(out.doubleTake, out.doubleDrop) > out.noDouble;
  out.takes = out.doubleTake < out.doubleDrop;
  return out;
}

}  // namespace bg
