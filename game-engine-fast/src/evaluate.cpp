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
  for (Row& row : rows) row.cubeful = row.cubeless.equity() * req.cubeValue;

  std::sort(rows.begin(), rows.end(), [](const Row& a, const Row& b) {
    if (a.cubeful != b.cubeful) return a.cubeful < b.cubeful;
    return a.key < b.key;
  });

  nlohmann::ordered_json moves = nlohmann::ordered_json::array();
  for (const Row& row : rows) {
    nlohmann::ordered_json steps = nlohmann::ordered_json::array();
    for (int s = 0; s < row.play->count; s++) steps.push_back(stepToJson(req.onRoll, row.play->steps[s]));
    nlohmann::ordered_json cubeless;
    cubeless["equity"] = row.cubeless.equity();
    cubeless["win"] = row.cubeless.win;
    cubeless["gammon"] = row.cubeless.gammon;
    cubeless["backgammon"] = row.cubeless.backgammon;
    cubeless["loseGammon"] = row.cubeless.loseGammon;
    cubeless["loseBackgammon"] = row.cubeless.loseBackgammon;
    nlohmann::ordered_json eval;
    eval["cubeless"] = cubeless;
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

}  // namespace bg
