#pragma once
// Match equity and the dead-cube formula, the same as ts-core/match (docs/domain/match-play.md,
// ADR 0018, ADR 0032). Used only for the final order of /evaluate plays and for /cube; the search
// itself stays on cubeless money equity.
#include <map>
#include <string>
#include <vector>

namespace bg {

// Cubeless outcome probabilities for the side to move (docs/domain/evaluation.md).
struct Cubeless {
  double win, gammon, backgammon, loseGammon, loseBackgammon;
  double equity() const { return win + gammon + backgammon - ((1 - win) + loseGammon + loseBackgammon); }
};

enum class Phase { Pre, Crawford, Post };

// Kazaross XG2 MET (docs/domain/data/kazaross-xg2-met.json).
struct Met {
  std::vector<std::vector<double>> crawford;  // [a-1][b-1]
  std::map<int, double> postCrawfordLeader;   // by trailer away
  std::map<int, double> postCrawfordTrailer;  // by trailer away
  // P(player at stmAway wins) vs oppAway; away <= 0 means the match is already decided.
  double equity(int stmAway, int oppAway, Phase phase) const;
};

Met parseMet(const std::string& json);
// MET_PATH, else /repo/docs/domain/data/kazaross-xg2-met.json (the Compose repo mount). Loaded
// once; throws std::runtime_error if missing or malformed.
const Met& met();

// Match state from one player's point of view.
struct MatchView {
  int length;
  int myScore;
  int oppScore;
};

// Phase of the game being played (ts-core matchPhase): the Crawford flag, else post-Crawford once
// a player is 1-away, else pre.
Phase matchPhase(int length, int scoreA, int scoreB, bool crawford);

// MWC for the player whose probs `c` are, with the cube dead at `cubeValue` (ts-core deadCubeMwc).
double deadCubeMwc(const Cubeless& c, const MatchView& me, int cubeValue, Phase phase);

struct CubeVerdict {
  double noDouble, doubleTake, doubleDrop;
  bool doubles;  // the doubler's offer
  bool takes;    // the taker's answer
};
// The cube decision values for the doubler (no double, double/take, double/drop) and its result.

// ---- Money play (ADR 0034, docs/domain/money-play.md): Janowski, x = 0.68, Jacoby off, no beavers.

constexpr double kCubeEfficiency = 0.68;

// Who may turn the cube, from one player's side (read from mayDouble). Dead: nobody may.
enum class CubeView { Centered, Mine, Theirs, Dead };

// Cubeful money equity for the player whose probs `c` are, in points at `cubeValue` (ts-core
// moneyCubeful): (1 - x) * dead + x * live; a dead cube is equity * value.
double moneyCubeful(const Cubeless& c, CubeView view, int cubeValue, double x = kCubeEfficiency);

// The doubler's money decision (view Centered or Mine, cube below 64), as ts-core moneyCubeVerdict:
// double when min(double/take, double/drop) > no double; take when double/take < double/drop.
CubeVerdict decideMoneyCube(const Cubeless& doubler, CubeView view, int cubeValue);

// ---- Live-cube match equity (ADR 0035), as ts-core match-cube.ts: Janowski carried over to MWC.
// Take and cash points come from the MET one cube level at a time (an owner of cube K may redouble
// to 2K up to 64); MWC = (1 - x) * dead + x * live. MET values depend only on the score, so they
// are tabled once per request; each call then costs a few dozen flops.
class MatchCubeTables {
 public:
  // `me`: the player whose probabilities will be passed in.
  MatchCubeTables(const MatchView& me, Phase phase);

  // Cubeful MWC for that player at cube `cubeValue` (a power of two up to 64) in `view`.
  double cubeful(const Cubeless& c, CubeView view, int cubeValue, double x = kCubeEfficiency) const;

  // The doubler's live-cube decision (view Centered or Mine, cube below 64), same rule as money.
  CubeVerdict decide(const Cubeless& doubler, CubeView view, int cubeValue, double x = kCubeEfficiency) const;

  static constexpr int kLevels = 7;  // cube 1, 2, 4, ..., 64
  // MWC for side s (0 = me, 1 = the opponent) after it gains `pts[0]` and the other `pts[1]`, per level.
  struct Side {
    double win[kLevels][3];   // after winning K, 2K, 3K
    double lose[kLevels][3];  // after losing K, 2K, 3K
    double drop[kLevels];     // after losing K / 2 (dropping a double to K); unused at level 0
  };

 private:
  Side side_[2];
};

}  // namespace bg
