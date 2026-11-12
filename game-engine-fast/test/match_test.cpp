// Match math (ADR 0032): MET lookups, the cube formula against ts-core reference values, the
// mover-MWC order of /evaluate, and cubeDecision.
#include <cmath>
#include <string>

#include <doctest/doctest.h>

#include "evaluate.hpp"
#include "features.hpp"
#include "helpers.hpp"
#include "match.hpp"

using namespace bgtest;

namespace {

// Every board gets the same probs, so the doubler's probs are known exactly.
struct ConstProbsNet : bg::Net {
  float p[5];
  explicit ConstProbsNet(float win, float g, float bg, float lg, float lbg) : p{win, g, bg, lg, lbg} {}
  void infer(const float*, int n, float* out) override {
    for (int r = 0; r < n; r++)
      for (int k = 0; k < 5; k++) out[r * 5 + k] = p[k];
  }
};

// Win and gammons vary with the board, so match and money orders can differ.
struct VaryingNet : bg::Net {
  void infer(const float* in, int n, float* out) override {
    for (int r = 0; r < n; r++) {
      const float* x = in + static_cast<size_t>(r) * bg::kFeatureSize;
      float s = 0;
      for (int i = 0; i < bg::kFeatureSize; i++) s += x[i] * static_cast<float>((i % 7) + 1);
      const float u = std::fmod(s, 1.0f);
      float* o = out + r * 5;
      o[0] = 0.3f + 0.4f * u;
      o[1] = 0.25f * (1 - u);
      o[2] = 0.01f;
      o[3] = 0.2f * u;
      o[4] = 0.005f;
    }
  }
};

const Abs kOpening = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);

nlohmann::json matchBody(const char* onRoll, int length, int s1, int s2, bool crawford, int cube, const char* owner,
                         bool withDice) {
  nlohmann::json j = toJson(kOpening, onRoll, 3, 1, cube);
  if (!withDice) j["dice"] = nullptr;
  const std::string o = owner;
  j["cube"]["owner"] = owner;
  j["cube"]["mayDouble"] = {{"p1", !crawford && o != "p2"}, {"p2", !crawford && o != "p1"}};
  j["match"] = {{"length", length}, {"score", {{"p1", s1}, {"p2", s2}}}, {"crawford", crawford}};
  return j;
}

// ts-core reference: cubeDecision for these doubler probs (computed with ts-core/match).
const bg::Cubeless kDoubler{0.68, 0.22, 0.02, 0.08, 0.005};

}  // namespace

TEST_CASE("MET lookups match docs/domain/data/kazaross-xg2-met.json") {
  const bg::Met& m = bg::met();
  CHECK(m.equity(1, 1, bg::Phase::Pre) == doctest::Approx(0.5));
  CHECK(m.equity(1, 2, bg::Phase::Pre) == doctest::Approx(0.67736));
  CHECK(m.equity(1, 2, bg::Phase::Post) == doctest::Approx(0.51197));
  CHECK(m.equity(2, 1, bg::Phase::Post) == doctest::Approx(0.48803));
  CHECK(m.equity(0, 3, bg::Phase::Pre) == 1);
  CHECK(m.equity(3, 0, bg::Phase::Pre) == 0);
}

TEST_CASE("cube formula equals ts-core on the same probs") {
  struct Case {
    int length, myScore, oppScore, cube;
    bg::Phase phase;
    bool doubles, takes;
    double noDouble, doubleTake, doubleDrop;
  };
  const Case cases[] = {
      {7, 0, 0, 1, bg::Phase::Pre, true, false, 0.5325603, 0.56667345, 0.56261},
      {7, 4, 2, 2, bg::Phase::Pre, false, true, 0.7459164, 0.7398176, 0.84179},
      {5, 2, 4, 1, bg::Phase::Post, true, true, 0.3444938, 0.45, 0.48803},
      {9, 3, 7, 4, bg::Phase::Pre, true, false, 0.45, 0.68, 0.5},
  };
  for (const Case& c : cases) {
    const bg::CubeVerdict v = bg::decideCube(kDoubler, bg::MatchView{c.length, c.myScore, c.oppScore}, c.cube, c.phase);
    CHECK(v.noDouble == doctest::Approx(c.noDouble).epsilon(1e-9));
    CHECK(v.doubleTake == doctest::Approx(c.doubleTake).epsilon(1e-9));
    CHECK(v.doubleDrop == doctest::Approx(c.doubleDrop).epsilon(1e-9));
    CHECK(v.doubles == c.doubles);
    CHECK(v.takes == c.takes);
  }
}

TEST_CASE("cubeDecision: the engine's own probs of the position, through the formula") {
  ConstProbsNet net(0.68f, 0.22f, 0.02f, 0.08f, 0.005f);
  // p2 on roll, p2 owns a 2-cube, 7-point match at p1 2 / p2 4: too good, ts-core says no-double.
  const auto req = bg::parseCubeRequest(matchBody("p2", 7, 2, 4, false, 2, "p2", false));
  const auto ply0 = bg::cubeDecision(req, 0, net);
  CHECK(ply0["available"] == true);
  CHECK(ply0["offer"] == "no-double");
  CHECK(ply0["take"] == "take");
  CHECK(ply0["noDouble"].get<double>() == doctest::Approx(0.7459164).epsilon(1e-6));
  CHECK(ply0["cubeless"]["win"].get<double>() == doctest::Approx(0.68));
  // Deeper, the decision is the same formula on whatever the search returns for the doubler (with
  // this constant net, 1-ply sees the opponent's probs flipped and 2-ply flips them back).
  for (int ply : {1, 2}) {
    const auto out = bg::cubeDecision(req, ply, net);
    const auto& c = out["cubeless"];
    const bg::Cubeless mine{c["win"], c["gammon"], c["backgammon"], c["loseGammon"], c["loseBackgammon"]};
    const bg::CubeVerdict v = bg::decideCube(mine, bg::MatchView{7, 4, 2}, 2, bg::Phase::Pre);
    CHECK(out["noDouble"].get<double>() == doctest::Approx(v.noDouble));
    CHECK(out["offer"] == (v.doubles ? "double" : "no-double"));
    CHECK(out["take"] == (v.takes ? "take" : "drop"));
    CHECK(c["win"].get<double>() == doctest::Approx(ply == 1 ? 0.32 : 0.68));
  }
}

TEST_CASE("cubeDecision: not available for money, Crawford, the opponent's cube, or cube 64") {
  ConstProbsNet net(0.68f, 0.22f, 0.02f, 0.08f, 0.005f);
  nlohmann::json money = toJson(kOpening, "p1", 3, 1);
  money["dice"] = nullptr;
  const nlohmann::json unavailable[] = {
      money,
      matchBody("p1", 7, 6, 0, true, 1, "centered", false),
      matchBody("p1", 7, 0, 0, false, 2, "p2", false),
      matchBody("p1", 7, 0, 0, false, 64, "p1", false),
  };
  for (const auto& body : unavailable) {
    nlohmann::json b = body;
    if (b["cube"]["value"] == 64) b["cube"]["mayDouble"] = {{"p1", false}, {"p2", false}};
    const auto out = bg::cubeDecision(bg::parseCubeRequest(b), 0, net);
    CHECK(out["available"] == false);
    CHECK(out["offer"] == "no-double");
    CHECK(out["take"].is_null());
    CHECK(out["noDouble"].is_null());
  }
  CHECK_THROWS_AS(bg::parseCubeRequest(matchBody("p1", 7, 0, 0, false, 1, "centered", true)), std::invalid_argument);
  CHECK_THROWS_AS(bg::parseEvalRequest(matchBody("p1", 7, 0, 0, false, 1, "centered", false)), std::invalid_argument);
}

TEST_CASE("/evaluate order: mover MWC at the score in a match, money equity otherwise") {
  VaryingNet net;
  for (int ply : {0, 1, 2}) {
    const auto req = bg::parseEvalRequest(matchBody("p1", 5, 0, 3, false, 1, "centered", true));
    const auto moves = bg::evaluate(req, ply, net)["moves"];
    REQUIRE(moves.size() > 1);
    double prev = 2;
    for (const auto& m : moves) {
      const auto& c = m["eval"]["cubeless"];
      const bg::Cubeless opp{c["win"], c["gammon"], c["backgammon"], c["loseGammon"], c["loseBackgammon"]};
      // Result STM is p2 (score 3 of 5); the mover's MWC is 1 minus theirs.
      const double mover = 1 - bg::deadCubeMwc(opp, bg::MatchView{5, 3, 0}, 1, bg::Phase::Pre);
      CHECK(mover <= prev + 1e-12);
      prev = mover;
      CHECK(m["eval"]["cubeAction"].is_null());
    }
  }
  const auto money = bg::evaluate(bg::parseEvalRequest(toJson(kOpening, "p1", 3, 1)), 0, net)["moves"];
  for (size_t i = 1; i < money.size(); i++) {
    CHECK(money[i - 1]["eval"]["cubefulEquity"].get<double>() <= money[i]["eval"]["cubefulEquity"].get<double>());
  }
}
