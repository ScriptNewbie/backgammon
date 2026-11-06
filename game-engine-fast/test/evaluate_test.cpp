#include <numeric>
#include <stdexcept>

#include <doctest/doctest.h>

#include "evaluate.hpp"
#include "features.hpp"
#include "helpers.hpp"

using namespace bgtest;

namespace {

// Deterministic stand-in for the net: win grows with the feature sum.
struct FakeNet : bg::Net {
  int calls = 0;
  int rows = 0;
  void infer(const float* in, int n, float* out) override {
    calls++;
    rows += n;
    for (int r = 0; r < n; r++) {
      const float* x = in + r * bg::kFeatureSize;
      const float s = std::accumulate(x, x + bg::kFeatureSize, 0.0f);
      float* o = out + r * 5;
      o[0] = s / 100.0f;
      o[1] = 0.1f;
      o[2] = 0.01f;
      o[3] = 0.05f;
      o[4] = 0.0f;
    }
  }
};

struct ThrowingNet : bg::Net {
  void infer(const float*, int, float*) override { throw std::logic_error("net must not run"); }
};

const Abs kOpening = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);

}  // namespace

TEST_CASE("0-ply: one batched net call, sorted best-first for the mover, cube wrap") {
  FakeNet net;
  const bg::EvalRequest req = bg::parseEvalRequest(toJson(kOpening, "p1", 3, 1, /*cube*/ 2));
  const auto out = bg::evaluate(req, 0, net);
  const auto& moves = out["moves"];
  const auto plays = bg::legalPlays(req.board, 3, 1);
  REQUIRE(moves.size() == plays.size());
  CHECK(net.calls == 1);
  CHECK(net.rows == static_cast<int>(plays.size()));
  for (size_t i = 0; i < moves.size(); i++) {
    const auto& ev = moves[i]["eval"];
    CHECK(ev["source"] == "model");
    CHECK(ev["cubeAction"].is_null());
    CHECK(ev["cubefulEquity"].get<double>() == doctest::Approx(ev["cubeless"]["equity"].get<double>() * 2));
    if (i > 0) CHECK(moves[i - 1]["eval"]["cubefulEquity"].get<double>() <= ev["cubefulEquity"].get<double>());
  }
  CHECK(moves[0]["steps"][0].contains("from"));
}

TEST_CASE("terminal results skip the net: gammon and backgammon") {
  ThrowingNet net;
  {
    // p1 bears off the last checker; p2 has none off and none in p1's home: gammon.
    const Abs a = pos({{3, 1}, {13, -15}}, 0, 0, 14, 0);
    const auto out = bg::evaluate(bg::parseEvalRequest(toJson(a, "p1", 5, 5)), 0, net);
    REQUIRE(out["moves"].size() == 1);
    const auto& c = out["moves"][0]["eval"]["cubeless"];
    CHECK(c["win"] == 0.0);
    CHECK(c["loseGammon"] == 1.0);
    CHECK(c["loseBackgammon"] == 0.0);
    CHECK(c["equity"] == -2.0);
    CHECK(out["moves"][0]["steps"][0]["to"] == "off");
  }
  {
    // p2 still has a checker in p1's home board (JSON 3): backgammon, cube 2 doubles it.
    const Abs a = pos({{1, 1}, {3, -1}, {13, -14}}, 0, 0, 14, 0);
    const auto out = bg::evaluate(bg::parseEvalRequest(toJson(a, "p1", 2, 1, 2)), 0, net);
    REQUIRE(out["moves"].size() == 1);
    CHECK(out["moves"][0]["eval"]["cubeless"]["equity"] == -3.0);
    CHECK(out["moves"][0]["eval"]["cubefulEquity"] == -6.0);
  }
}

TEST_CASE("dance returns no moves; ply above the search limit is not implemented yet") {
  ThrowingNet net;
  const Abs a = pos({{19, -2}, {20, -2}, {21, -2}, {22, -2}, {23, -2}, {24, -2}}, 1, 0, 14, 3);
  CHECK(bg::evaluate(bg::parseEvalRequest(toJson(a, "p1", 6, 5)), 0, net)["moves"].empty());
  CHECK_THROWS_AS(bg::evaluate(bg::parseEvalRequest(toJson(kOpening, "p1", 3, 1)), bg::kMaxSearchPly + 1, net), std::invalid_argument);
}
