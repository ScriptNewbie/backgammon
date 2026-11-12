#include "evaluate.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

#include "features.hpp"
#include "search.hpp"
#include "movegen.hpp"

namespace bg {

Cubeless terminalCubelessForLoser(Result moverWon) {
  Cubeless c{0, 0, 0, 0, 0};
  c.loseGammon = moverWon == Result::Single ? 0 : 1;
  c.loseBackgammon = moverWon == Result::Backgammon ? 1 : 0;
  return c;
}

namespace {

int idx(Player p) { return p == Player::P1 ? 0 : 1; }

// The match from `p`'s side.
MatchView viewOf(const EvalRequest& req, Player p) {
  const Player other = p == Player::P1 ? Player::P2 : Player::P1;
  return MatchView{req.matchLength, req.score[idx(p)], req.score[idx(other)]};
}

Phase phaseOf(const EvalRequest& req) {
  return matchPhase(req.matchLength, req.score[0], req.score[1], req.crawford);
}

nlohmann::ordered_json cubelessJson(const Cubeless& c) {
  nlohmann::ordered_json j;
  j["equity"] = c.equity();
  j["win"] = c.win;
  j["gammon"] = c.gammon;
  j["backgammon"] = c.backgammon;
  j["loseGammon"] = c.loseGammon;
  j["loseBackgammon"] = c.loseBackgammon;
  return j;
}

}  // namespace

nlohmann::ordered_json evaluate(const EvalRequest& req, int ply, Net& net, SearchStats* stats) {
  if (ply < 0 || ply > kMaxSearchPly) {
    throw std::invalid_argument("ply " + std::to_string(ply) + " is not implemented yet");
  }
  const std::vector<Play> plays = legalPlays(req.board, req.die1, req.die2);

  struct Row {
    const Play* play;
    Cubeless cubeless;
    double cubeful;
    std::string key;
    double rank = 0;  // higher is better for the mover
  };
  std::vector<Row> rows;
  // Non-terminal plays are searched from the opponent's turn (opponent is STM of the result).
  std::vector<Board> searchBoards;
  std::vector<const Play*> open;
  for (const Play& play : plays) {
    const Result r = moverResult(play.result);
    if (r != Result::None) {  // exact: always returned
      rows.push_back(Row{&play, terminalCubelessForLoser(r), 0, stepsKey(req.onRoll, play.steps, play.count)});
      continue;
    }
    open.push_back(&play);
    searchBoards.push_back(flipped(play.result));
  }
  Search search(net);
  if (ply >= 2 && searchBoards.size() > 1) {
    // Root filter: only plays that survive at 0-ply are searched to full depth and returned.
    const std::vector<Probs> shallow = search.evaluate(searchBoards, 0);
    std::vector<double> moverEquity;
    for (const Probs& p : shallow) moverEquity.push_back(-p.equity());
    std::vector<Board> keptBoards;
    std::vector<const Play*> keptPlays;
    for (int i : applyFilter(moverEquity, kRootFilter)) {
      keptBoards.push_back(searchBoards[i]);
      keptPlays.push_back(open[i]);
    }
    searchBoards.swap(keptBoards);
    open.swap(keptPlays);
  }
  if (!searchBoards.empty()) {
    const std::vector<Probs> values = search.evaluate(searchBoards, ply);
    for (size_t j = 0; j < open.size(); j++) {
      const float* o = values[j].p;
      rows.push_back(Row{open[j], Cubeless{o[0], o[1], o[2], o[3], o[4]}, 0,
                         stepsKey(req.onRoll, open[j]->steps, open[j]->count)});
    }
  }
  if (stats) *stats = search.stats();
  // Final order at the match state (ADR 0032). Each row's probs are for the opponent (STM of the
  // result), so the mover's MWC is 1 minus theirs at the unchanged cube.
  const Player opponent = req.onRoll == Player::P1 ? Player::P2 : Player::P1;
  for (Row& row : rows) {
    row.cubeful = row.cubeless.equity() * req.cubeValue;
    row.rank = req.hasMatch ? 1 - deadCubeMwc(row.cubeless, viewOf(req, opponent), req.cubeValue, phaseOf(req))
                            : -row.cubeful;
  }
  std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) {
    if (a.rank != b.rank) return a.rank > b.rank;
    return a.key < b.key;
  });

  nlohmann::ordered_json moves = nlohmann::ordered_json::array();
  for (const Row& row : rows) {
    nlohmann::ordered_json steps = nlohmann::ordered_json::array();
    for (int s = 0; s < row.play->count; s++) steps.push_back(stepToJson(req.onRoll, row.play->steps[s]));
    nlohmann::ordered_json eval;
    eval["cubeless"] = cubelessJson(row.cubeless);
    eval["cubefulEquity"] = row.cubeful;
    eval["cubeAction"] = nullptr;
    eval["source"] = "model";
    nlohmann::ordered_json move;
    move["steps"] = steps;
    move["eval"] = eval;
    moves.push_back(move);
  }
  nlohmann::ordered_json response;
  response["moves"] = moves;
  return response;
}

nlohmann::ordered_json cubeDecision(const EvalRequest& req, int ply, Net& net, SearchStats* stats) {
  if (ply < 0 || ply > kMaxSearchPly) {
    throw std::invalid_argument("ply " + std::to_string(ply) + " is not implemented yet");
  }
  // The doubler is about to roll: exactly what the search values (side to move about to roll).
  Search search(net);
  const Probs p = search.evaluate({req.board}, ply)[0];
  if (stats) *stats = search.stats();
  const Cubeless mine{p.p[0], p.p[1], p.p[2], p.p[3], p.p[4]};

  nlohmann::ordered_json out;
  const bool available = req.hasMatch && req.mayDouble[idx(req.onRoll)] && req.cubeValue < 64;
  out["available"] = available;
  if (!available) {
    out["offer"] = "no-double";
    out["take"] = nullptr;
    out["noDouble"] = nullptr;
    out["doubleTake"] = nullptr;
    out["doubleDrop"] = nullptr;
  } else {
    const CubeVerdict v = decideCube(mine, viewOf(req, req.onRoll), req.cubeValue, phaseOf(req));
    out["offer"] = v.doubles ? "double" : "no-double";
    out["take"] = v.takes ? "take" : "drop";
    out["noDouble"] = v.noDouble;
    out["doubleTake"] = v.doubleTake;
    out["doubleDrop"] = v.doubleDrop;
  }
  out["cubeless"] = cubelessJson(mine);
  return out;
}

}  // namespace bg
