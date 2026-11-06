#include "evaluate.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <vector>

#include "features.hpp"
#include "movegen.hpp"

namespace bg {

Cubeless terminalCubelessForLoser(Result moverWon) {
  Cubeless c{0, 0, 0, 0, 0};
  c.loseGammon = moverWon == Result::Single ? 0 : 1;
  c.loseBackgammon = moverWon == Result::Backgammon ? 1 : 0;
  return c;
}

nlohmann::ordered_json evaluate(const EvalRequest& req, int ply, Net& net) {
  if (ply != 0) {
    throw std::invalid_argument("ply " + std::to_string(ply) + " is not implemented yet");
  }
  const std::vector<Play> plays = legalPlays(req.board, req.die1, req.die2);

  struct Row {
    const Play* play;
    Cubeless cubeless;
    double cubeful;
    std::string key;
  };
  std::vector<Row> rows(plays.size());
  std::vector<float> features;
  std::vector<size_t> needNet;
  for (size_t i = 0; i < plays.size(); i++) {
    rows[i].play = &plays[i];
    rows[i].key = stepsKey(req.onRoll, plays[i].steps, plays[i].count);
    const Result r = moverResult(plays[i].result);
    if (r != Result::None) {
      rows[i].cubeless = terminalCubelessForLoser(r);
      continue;
    }
    needNet.push_back(i);
    features.resize(needNet.size() * kFeatureSize);
    featurize(flipped(plays[i].result), features.data() + (needNet.size() - 1) * kFeatureSize);
  }
  if (!needNet.empty()) {
    std::vector<float> out(needNet.size() * 5);
    net.infer(features.data(), static_cast<int>(needNet.size()), out.data());
    for (size_t j = 0; j < needNet.size(); j++) {
      const float* o = out.data() + j * 5;
      rows[needNet[j]].cubeless = Cubeless{o[0], o[1], o[2], o[3], o[4]};
    }
  }
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
