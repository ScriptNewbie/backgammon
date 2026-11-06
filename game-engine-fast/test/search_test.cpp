#include <cmath>
#include <random>
#include <set>
#include <stdexcept>
#include <utility>

#include <doctest/doctest.h>

#include "evaluate.hpp"
#include "features.hpp"
#include "helpers.hpp"
#include "search.hpp"

using namespace bgtest;

namespace {

float sigmoid(float x) { return 1.0f / (1.0f + std::exp(-x)); }

// Deterministic, deliberately asymmetric stand-in for the net (gammon != loseGammon), so a missing
// or extra perspective flip changes the result.
struct FakeNet : bg::Net {
  int64_t rows = 0;
  void infer(const float* in, int n, float* out) override {
    rows += n;
    for (int r = 0; r < n; r++) {
      const float* x = in + static_cast<size_t>(r) * bg::kFeatureSize;
      float s = 0, s2 = 0;
      for (int i = 0; i < bg::kFeatureSize; i++) {
        s += x[i] * static_cast<float>((i * 37) % 11 - 5) / 50.0f;
        s2 += x[i] * static_cast<float>((i * 13) % 7 - 3) / 40.0f;
      }
      float* o = out + static_cast<size_t>(r) * 5;
      o[0] = sigmoid(s);
      o[1] = 0.25f * o[0] * sigmoid(s2);
      o[2] = 0.1f * o[1];
      o[3] = 0.3f * (1.0f - o[0]) * sigmoid(-s2);
      o[4] = 0.05f * o[3];
    }
  }
};

struct ThrowingNet : bg::Net {
  void infer(const float*, int, float*) override { throw std::logic_error("net must not run"); }
};

// Plain recursive expectimax: one net call per leaf, no batching, no tree, no dedupe.
bg::Probs reference(const bg::Board& b, int depth, bg::Net& net) {
  if (depth == 0) {
    float x[bg::kFeatureSize];
    bg::featurize(b, x);
    bg::Probs p;
    net.infer(x, 1, p.p);
    return p;
  }
  double sum[5] = {0, 0, 0, 0, 0};
  for (const bg::Roll& roll : bg::allRolls()) {
    const auto plays = bg::legalPlays(b, roll.die1, roll.die2);
    bg::Probs best{};
    bool have = false;
    auto consider = [&](const bg::Probs& v) {
      if (!have || v.equity() > best.equity()) best = v;
      have = true;
    };
    if (plays.empty()) consider(bg::flipProbs(reference(bg::flipped(b), depth - 1, net)));
    for (const bg::Play& play : plays) {
      bg::Probs exact;
      if (bg::terminalForMover(play.result, exact)) {
        consider(exact);
      } else {
        consider(bg::flipProbs(reference(bg::flipped(play.result), depth - 1, net)));
      }
    }
    for (int k = 0; k < 5; k++) sum[k] += roll.weight * best.p[k];
  }
  bg::Probs out;
  for (int k = 0; k < 5; k++) out.p[k] = static_cast<float>(sum[k]);
  return out;
}

void checkClose(const bg::Probs& a, const bg::Probs& b) {
  for (int k = 0; k < 5; k++) CHECK(a.p[k] == doctest::Approx(b.p[k]).epsilon(1e-5));
}

bg::Board boardOf(const Abs& a, const char* onRoll) { return bg::parseEvalRequest(toJson(a, onRoll, 1, 2)).board; }

const Abs kOpening = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);

}  // namespace

TEST_CASE("21 rolls, each once, weights sum to 1") {
  const auto& rolls = bg::allRolls();
  REQUIRE(rolls.size() == 21);
  std::set<std::pair<int, int>> seen;
  double total = 0;
  for (const bg::Roll& r : rolls) {
    CHECK(r.die1 <= r.die2);
    CHECK(seen.insert({r.die1, r.die2}).second);
    CHECK(r.weight == doctest::Approx(r.die1 == r.die2 ? 1.0 / 36 : 2.0 / 36));
    total += r.weight;
  }
  CHECK(total == doctest::Approx(1.0));
}

TEST_CASE("flipProbs swaps sides and negates equity") {
  const bg::Probs p{{0.6f, 0.2f, 0.05f, 0.1f, 0.01f}};
  const bg::Probs q = bg::flipProbs(p);
  CHECK(q.p[0] == doctest::Approx(0.4f));
  CHECK(q.p[1] == doctest::Approx(0.1f));
  CHECK(q.p[3] == doctest::Approx(0.2f));
  CHECK(q.equity() == doctest::Approx(-p.equity()));
  checkClose(bg::flipProbs(q), p);
}

TEST_CASE("1-ply: the side to roll wins on every roll — exact, no net call") {
  ThrowingNet net;
  bg::Search search(net);
  // STM (p1, to roll) has one checker on its 1-point; any roll bears it off.
  // p2 all on JSON 2 (its 23-point, in p1's home): backgammon. On JSON 13: gammon. One off: single.
  const auto bgv = search.evaluate({boardOf(pos({{1, 1}, {2, -15}}, 0, 0, 14, 0), "p1")}, 1);
  CHECK(bgv[0].equity() == doctest::Approx(3.0));
  const auto gam = search.evaluate({boardOf(pos({{1, 1}, {13, -15}}, 0, 0, 14, 0), "p1")}, 1);
  CHECK(gam[0].equity() == doctest::Approx(2.0));
  const auto single = search.evaluate({boardOf(pos({{1, 1}, {13, -14}}, 0, 0, 14, 1), "p1")}, 1);
  CHECK(single[0].equity() == doctest::Approx(1.0));
  CHECK(single[0].p[0] == doctest::Approx(1.0));
  CHECK(search.stats().leaves == 0);
}

TEST_CASE("1-ply: every roll dances, so the value is the other side's 0-ply, flipped") {
  FakeNet net;
  bg::Search search(net);
  // p1 on the bar against p2's closed board (JSON 19-24).
  const bg::Board b = boardOf(pos({{19, -2}, {20, -2}, {21, -2}, {22, -2}, {23, -2}, {24, -2}}, 1, 0, 14, 3), "p1");
  const auto got = search.evaluate({b}, 1);
  checkClose(got[0], bg::flipProbs(reference(bg::flipped(b), 0, net)));
  CHECK(search.stats().leaves == 1);  // 21 passes, one distinct leaf
  CHECK(search.stats().leafVisits == 21);
}

TEST_CASE("batched search equals the plain recursive reference (1-ply, contact positions)") {
  FakeNet net;
  // Opening, both sides to roll, plus positions from a seeded random game.
  std::vector<bg::Board> boards = {boardOf(kOpening, "p1"), boardOf(kOpening, "p2")};
  std::mt19937 rng(3);
  bg::Board b = boardOf(kOpening, "p1");
  for (int turn = 0; turn < 40; turn++) {
    const int d1 = 1 + static_cast<int>(rng() % 6), d2 = 1 + static_cast<int>(rng() % 6);
    const auto plays = bg::legalPlays(b, d1, d2);
    if (!plays.empty()) {
      const bg::Board& next = plays[rng() % plays.size()].result;
      if (bg::moverResult(next) != bg::Result::None) break;
      b = next;
    }
    b = bg::flipped(b);
    if (turn % 8 == 7) boards.push_back(b);
  }
  REQUIRE(boards.size() >= 6);
  bg::Search search(net);
  const auto got = search.evaluate(boards, 1);
  for (size_t i = 0; i < boards.size(); i++) {
    INFO("board ", i);
    checkClose(got[i], reference(boards[i], 1, net));
  }
  CHECK(search.stats().leaves < search.stats().leafVisits);  // transpositions were shared
}

TEST_CASE("batched search equals the reference at 2-ply (bear-off race)") {
  FakeNet net;
  // Small tree: p1 three checkers home, p2 two checkers home, no contact.
  const bg::Board b = boardOf(pos({{2, 2}, {4, 1}, {22, -1}, {20, -1}}, 0, 0, 12, 13), "p1");
  bg::Search search(net);
  checkClose(search.evaluate({b}, 2)[0], reference(b, 2, net));
}

TEST_CASE("evaluate at ply 1 returns every play with searched evals; ply 2 is not implemented yet") {
  FakeNet net;
  const bg::EvalRequest req = bg::parseEvalRequest(toJson(kOpening, "p1", 3, 1));
  bg::SearchStats stats;
  const auto out = bg::evaluate(req, 1, net, &stats);
  const auto plays = bg::legalPlays(req.board, 3, 1);
  REQUIRE(out["moves"].size() == plays.size());
  CHECK(stats.nodes == static_cast<int64_t>(plays.size()));
  CHECK(stats.leaves > 0);
  for (size_t i = 1; i < out["moves"].size(); i++) {
    CHECK(out["moves"][i - 1]["eval"]["cubefulEquity"].get<double>() <=
          out["moves"][i]["eval"]["cubefulEquity"].get<double>());
  }
  // Best for the mover = lowest opponent equity; it must equal the reference minimum (cube 1).
  double minRef = 1e9;
  for (const bg::Play& p : plays) minRef = std::fmin(minRef, reference(bg::flipped(p.result), 1, net).equity());
  CHECK(out["moves"][0]["eval"]["cubeless"]["equity"].get<double>() == doctest::Approx(minRef).epsilon(1e-5));
  CHECK_THROWS_AS(bg::evaluate(req, 2, net), std::invalid_argument);
}
