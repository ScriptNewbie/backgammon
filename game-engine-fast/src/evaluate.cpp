#include "evaluate.hpp"

#include <algorithm>
#include <optional>
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

// Who may turn the cube from `p`'s side, from mayDouble (as ts-core cubeView).
CubeView cubeViewOf(const EvalRequest& req, Player p) {
  const bool me = req.mayDouble[idx(p)];
  const bool them = req.mayDouble[1 - idx(p)];
  if (me && them) return CubeView::Centered;
  if (me) return CubeView::Mine;
  if (them) return CubeView::Theirs;
  return CubeView::Dead;
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

Player other(Player p) { return p == Player::P1 ? Player::P2 : Player::P1; }

// The request's own decision values (ADR 0034, ADR 0035): live-cube MWC in a match, Janowski
// money equity otherwise, at the request's cube and score. Also the search Scorer, with
// `rootPlayer` the side to move at the search's root boards. Inside the search a match value is
// EMG (MWC mapped linearly so that losing / winning one cube is -1 / +1) and a money value is per
// unit of cube, so the move filters' equity thresholds keep their meaning; the order is the same.
class Decisions : public Scorer {
 public:
  Decisions(const EvalRequest& req, Player rootPlayer) : req_(req), root_(rootPlayer) {
    for (Player p : {Player::P1, Player::P2}) {
      const int i = idx(p);
      view_[i] = cubeViewOf(req, p);
      if (!req.hasMatch) continue;
      tables_[i].emplace(viewOf(req, p), phaseOf(req));
      const MatchView v = viewOf(req, p);
      const Met& table = met();
      emgWin_[i] = table.equity(v.length - (v.myScore + req.cubeValue), v.length - v.oppScore, phaseOf(req));
      emgLose_[i] = table.equity(v.length - v.myScore, v.length - (v.oppScore + req.cubeValue), phaseOf(req));
    }
  }

  // What `p` makes of its own probs `c`: MWC (match) or money equity in points (money).
  double of(Player p, const Cubeless& c) const {
    const int i = idx(p);
    return req_.hasMatch ? tables_[i]->cubeful(c, view_[i], req_.cubeValue) : moneyCubeful(c, view_[i], req_.cubeValue);
  }

  double value(const Probs& mine, bool rootSide) const override {
    const Player p = rootSide ? root_ : other(root_);
    const double v = of(p, Cubeless{mine.p[0], mine.p[1], mine.p[2], mine.p[3], mine.p[4]});
    if (!req_.hasMatch) return v / req_.cubeValue;
    const int i = idx(p);
    const double span = emgWin_[i] - emgLose_[i];
    return span > 1e-12 ? (2 * v - (emgWin_[i] + emgLose_[i])) / span : v;
  }

  const MatchCubeTables& tables(Player p) const { return *tables_[idx(p)]; }
  CubeView view(Player p) const { return view_[idx(p)]; }

 private:
  const EvalRequest& req_;
  Player root_;
  CubeView view_[2];
  std::optional<MatchCubeTables> tables_[2];
  double emgWin_[2] = {1, 1};
  double emgLose_[2] = {0, 0};
};

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
  // The search roots are the results, opponent to move; plays inside are chosen at the score.
  const Player opponent = other(req.onRoll);
  const Decisions decisions(req, opponent);
  Search search(net);
  if (ply >= 2 && searchBoards.size() > 1) {
    // Root filter: only plays that survive at 0-ply are searched to full depth and returned. The
    // mover (not the roots' side) values each result, at the score (ADR 0035).
    const std::vector<Probs> shallow = search.evaluate(searchBoards, 0, &decisions);
    std::vector<double> moverEquity;
    for (const Probs& p : shallow) moverEquity.push_back(decisions.value(flipProbs(p), /*rootSide*/ false));
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
    const std::vector<Probs> values = search.evaluate(searchBoards, ply, &decisions);
    for (size_t j = 0; j < open.size(); j++) {
      const float* o = values[j].p;
      rows.push_back(Row{open[j], Cubeless{o[0], o[1], o[2], o[3], o[4]}, 0,
                         stepsKey(req.onRoll, open[j]->steps, open[j]->count)});
    }
  }
  if (stats) *stats = search.stats();
  // Final order at the match state (ADR 0032, 0034, 0035). Each row's probs are for the opponent
  // (STM of the result): cubefulEquity is their Janowski money equity, and the mover's MWC is 1
  // minus their live-cube MWC at the unchanged cube.
  for (Row& row : rows) {
    row.cubeful = moneyCubeful(row.cubeless, cubeViewOf(req, opponent), req.cubeValue);
    row.rank = req.hasMatch ? 1 - decisions.of(opponent, row.cubeless) : -row.cubeful;
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
    move["moverValue"] = row.rank;
    moves.push_back(move);
  }
  nlohmann::ordered_json response;
  response["moves"] = moves;
  response["moverValueKind"] = req.hasMatch ? "mwc" : "money";
  return response;
}

nlohmann::ordered_json cubeDecision(const EvalRequest& req, int ply, Net& net, SearchStats* stats) {
  if (ply < 0 || ply > kMaxSearchPly) {
    throw std::invalid_argument("ply " + std::to_string(ply) + " is not implemented yet");
  }
  // The doubler is about to roll: exactly what the search values (side to move about to roll).
  const Decisions decisions(req, req.onRoll);
  Search search(net);
  const Probs p = search.evaluate({req.board}, ply, &decisions)[0];
  if (stats) *stats = search.stats();
  const Cubeless mine{p.p[0], p.p[1], p.p[2], p.p[3], p.p[4]};

  nlohmann::ordered_json out;
  const bool available = req.mayDouble[idx(req.onRoll)] && req.cubeValue < 64;
  out["available"] = available;
  if (!available) {
    out["offer"] = "no-double";
    out["take"] = nullptr;
    out["noDouble"] = nullptr;
    out["doubleTake"] = nullptr;
    out["doubleDrop"] = nullptr;
  } else {
    const CubeView doublerView = decisions.view(req.onRoll) == CubeView::Mine ? CubeView::Mine : CubeView::Centered;
    const CubeVerdict v = req.hasMatch ? decisions.tables(req.onRoll).decide(mine, doublerView, req.cubeValue)
                                       : decideMoneyCube(mine, doublerView, req.cubeValue);
    out["offer"] = v.doubles ? "double" : "no-double";
    out["take"] = v.takes ? "take" : "drop";
    out["noDouble"] = v.noDouble;
    out["doubleTake"] = v.doubleTake;
    out["doubleDrop"] = v.doubleDrop;
  }
  out["cubeless"] = cubelessJson(mine);
  out["currency"] = req.hasMatch ? "mwc" : "money";
  return out;
}

}  // namespace bg
