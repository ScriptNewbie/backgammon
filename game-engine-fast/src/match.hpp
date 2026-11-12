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
// The infallible dead-cube decision for the doubler (ts-core evaluateCube). Cube value below 64.
CubeVerdict decideCube(const Cubeless& doubler, const MatchView& doublerView, int cubeValue, Phase phase);

}  // namespace bg
