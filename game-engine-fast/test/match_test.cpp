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

TEST_CASE("live-cube match equity and cube decisions equal ts-core on the same probs") {
  // ts-core matchCubeful / matchCubeVerdict for kDoubler, p1 the doubler (ADR 0035).
  struct Case {
    int length, myScore, oppScore;
    bg::Phase phase;
    double centered, mine, theirs, dead, theirs2;
    bool doubles, takes;
    double doubleDrop;
  };
  const Case cases[] = {
      {7, 0, 0, bg::Phase::Pre, 0.54523972663356313, 0.54726248010627332, 0.52538868825999430, 0.53256030000000010,
       0.55215237900285619, true, true, 0.56261},
      {7, 4, 2, bg::Phase::Pre, 0.71095108152339348, 0.71724779477473022, 0.69324655310210315, 0.70707205000000006,
       0.70686299690368004, false, true, 0.74359},
      {5, 2, 4, bg::Phase::Post, 0.41623801600000010, 0.41623801600000010, 0.34449379999999996, 0.34449380000000002,
       0.45000000000000007, true, true, 0.48803},
      {9, 3, 7, bg::Phase::Pre, 0.24650412551048154, 0.24650412551048154, 0.21780369565983415, 0.21926480000000004,
       0.27239800000000003, true, false, 0.25641},
      {11, 5, 5, bg::Phase::Pre, 0.55038165593195232, 0.55209100253652499, 0.52747016096266952, 0.53562169999999998,
       0.56011039982556798, true, true, 0.56635},
  };
  for (const Case& c : cases) {
    INFO(c.length << " " << c.myScore << "-" << c.oppScore);
    const bg::MatchCubeTables t(bg::MatchView{c.length, c.myScore, c.oppScore}, c.phase);
    CHECK(t.cubeful(kDoubler, bg::CubeView::Centered, 1) == doctest::Approx(c.centered).epsilon(1e-12));
    CHECK(t.cubeful(kDoubler, bg::CubeView::Mine, 1) == doctest::Approx(c.mine).epsilon(1e-12));
    CHECK(t.cubeful(kDoubler, bg::CubeView::Theirs, 1) == doctest::Approx(c.theirs).epsilon(1e-12));
    CHECK(t.cubeful(kDoubler, bg::CubeView::Dead, 1) == doctest::Approx(c.dead).epsilon(1e-12));
    CHECK(t.cubeful(kDoubler, bg::CubeView::Theirs, 2) == doctest::Approx(c.theirs2).epsilon(1e-12));
    // The dead value is the existing dead-cube MWC.
    CHECK(t.cubeful(kDoubler, bg::CubeView::Dead, 1) ==
          doctest::Approx(bg::deadCubeMwc(kDoubler, bg::MatchView{c.length, c.myScore, c.oppScore}, 1, c.phase)));
    const bg::CubeVerdict v = t.decide(kDoubler, bg::CubeView::Centered, 1);
    CHECK(v.noDouble == doctest::Approx(c.centered).epsilon(1e-12));
    CHECK(v.doubleTake == doctest::Approx(c.theirs2).epsilon(1e-12));
    CHECK(v.doubleDrop == doctest::Approx(c.doubleDrop).epsilon(1e-9));
    CHECK(v.doubles == c.doubles);
    CHECK(v.takes == c.takes);
  }
}

TEST_CASE("cubeDecision: the engine's own probs of the position, through the live-cube formula") {
  ConstProbsNet net(0.68f, 0.22f, 0.02f, 0.08f, 0.005f);
  // p1 on roll, 7-point match at p1 4 / p2 2, centered cube: ts-core says no double, take.
  const auto req = bg::parseCubeRequest(matchBody("p1", 7, 4, 2, false, 1, "centered", false));
  const auto ply0 = bg::cubeDecision(req, 0, net);
  CHECK(ply0["available"] == true);
  CHECK(ply0["currency"] == "mwc");
  CHECK(ply0["offer"] == "no-double");
  CHECK(ply0["take"] == "take");
  CHECK(ply0["noDouble"].get<double>() == doctest::Approx(0.71095108152339348).epsilon(1e-6));
  CHECK(ply0["cubeless"]["win"].get<double>() == doctest::Approx(0.68));
  // Deeper, the decision is the same formula on whatever the search returns for the doubler (with
  // this constant net, 1-ply sees the opponent's probs flipped and 2-ply flips them back).
  const bg::MatchCubeTables t(bg::MatchView{7, 4, 2}, bg::Phase::Pre);
  for (int ply : {1, 2}) {
    const auto out = bg::cubeDecision(req, ply, net);
    const auto& c = out["cubeless"];
    const bg::Cubeless mine{c["win"], c["gammon"], c["backgammon"], c["loseGammon"], c["loseBackgammon"]};
    const bg::CubeVerdict v = t.decide(mine, bg::CubeView::Centered, 1);
    CHECK(out["noDouble"].get<double>() == doctest::Approx(v.noDouble));
    CHECK(out["offer"] == (v.doubles ? "double" : "no-double"));
    CHECK(out["take"] == (v.takes ? "take" : "drop"));
    CHECK(c["win"].get<double>() == doctest::Approx(ply == 1 ? 0.32 : 0.68));
  }
}

TEST_CASE("cubeDecision: not available in the Crawford game, on the opponent's cube, or at cube 64") {
  ConstProbsNet net(0.68f, 0.22f, 0.02f, 0.08f, 0.005f);
  const nlohmann::json unavailable[] = {
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
  const bg::MatchCubeTables oppTables(bg::MatchView{5, 3, 0}, bg::Phase::Pre);
  for (int ply : {0, 1, 2}) {
    const auto req = bg::parseEvalRequest(matchBody("p1", 5, 0, 3, false, 1, "centered", true));
    const auto moves = bg::evaluate(req, ply, net)["moves"];
    REQUIRE(moves.size() > 1);
    double prev = 2;
    for (const auto& m : moves) {
      const auto& c = m["eval"]["cubeless"];
      const bg::Cubeless opp{c["win"], c["gammon"], c["backgammon"], c["loseGammon"], c["loseBackgammon"]};
      // Result STM is p2 (score 3 of 5); the mover's MWC is 1 minus their live-cube MWC.
      const double mover = 1 - oppTables.cubeful(opp, bg::CubeView::Centered, 1);
      CHECK(m["moverValue"].get<double>() == doctest::Approx(mover));
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

TEST_CASE("Janowski money equity and cube decisions equal ts-core") {
  // ts-core moneyCubeful / moneyCubeVerdict on the same probs (ADR 0034).
  CHECK(bg::moneyCubeful(kDoubler, bg::CubeView::Centered, 2) == doctest::Approx(1.4266666666666667).epsilon(1e-12));
  CHECK(bg::moneyCubeful(kDoubler, bg::CubeView::Mine, 2) == doctest::Approx(1.4924).epsilon(1e-12));
  CHECK(bg::moneyCubeful(kDoubler, bg::CubeView::Theirs, 2) == doctest::Approx(0.8124).epsilon(1e-12));
  CHECK(bg::moneyCubeful(kDoubler, bg::CubeView::Dead, 2) == doctest::Approx(1.03).epsilon(1e-12));
  const bg::CubeVerdict centered = bg::decideMoneyCube(kDoubler, bg::CubeView::Centered, 1);
  CHECK(centered.noDouble == doctest::Approx(0.7133333333333334).epsilon(1e-12));
  CHECK(centered.doubleTake == doctest::Approx(0.8124).epsilon(1e-12));
  CHECK(centered.doubleDrop == 1);
  CHECK(centered.doubles);
  CHECK(centered.takes);
  const bg::CubeVerdict race = bg::decideMoneyCube(bg::Cubeless{0.72, 0, 0, 0, 0}, bg::CubeView::Centered, 1);
  CHECK(race.noDouble == doctest::Approx(0.6394666666666665).epsilon(1e-12));
  CHECK(race.doubleTake == doctest::Approx(0.6896).epsilon(1e-12));
  CHECK(race.doubles);
  CHECK(race.takes);
}

TEST_CASE("money /cube: the engine's own probs through Janowski; money /evaluate carries mover values") {
  ConstProbsNet net(0.68f, 0.22f, 0.02f, 0.08f, 0.005f);
  nlohmann::json body = toJson(kOpening, "p1", 3, 1);
  body["dice"] = nullptr;
  const auto out = bg::cubeDecision(bg::parseCubeRequest(body), 0, net);
  CHECK(out["available"] == true);
  CHECK(out["currency"] == "money");
  CHECK(out["offer"] == "double");
  CHECK(out["take"] == "take");
  CHECK(out["noDouble"].get<double>() == doctest::Approx(0.7133333333333334).epsilon(1e-6));
  const auto moves = bg::evaluate(bg::parseEvalRequest(toJson(kOpening, "p1", 3, 1)), 0, net);
  CHECK(moves["moverValueKind"] == "money");
  for (const auto& m : moves["moves"]) {
    CHECK(m["moverValue"].get<double>() == doctest::Approx(-m["eval"]["cubefulEquity"].get<double>()));
  }
  const auto match = bg::evaluate(bg::parseEvalRequest(matchBody("p1", 5, 0, 3, false, 1, "centered", true)), 0, net);
  CHECK(match["moverValueKind"] == "mwc");
}
