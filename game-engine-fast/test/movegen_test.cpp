// Hand-checked legal-play cases. Each expected play is written in JSON steps; results are compared
// as sets of resulting boards (the engine keeps one play per distinct board).
#include <doctest/doctest.h>

#include "helpers.hpp"

using namespace bgtest;

TEST_CASE("dance: every entry point blocked") {
  // p1 on the bar; p2 holds JSON 19-24 (p1's entry points 25 - die).
  const Abs a = pos({{19, -2}, {20, -2}, {21, -2}, {22, -2}, {23, -2}, {24, -2}}, 1, 0, 14, 3);
  CHECK(resultSet(a, "p1", 6, 5).empty());
  CHECK(resultSet(a, "p1", 3, 3).empty());
}

TEST_CASE("bar: enter what you can, nothing else moves while on the bar") {
  // Two on the bar, 6 entry (JSON 19) blocked: enter with the 1, the 6 is lost.
  const Abs a = pos({{19, -2}}, 2, 0, 13, 13);
  CHECK(resultSet(a, "p1", 6, 1) == expectedSet(a, "p1", {"bar/24"}));
}

TEST_CASE("bar entry for p2 (enters on JSON point = die)") {
  const Abs a = pos({{6, 2}}, 0, 2, 13, 13);
  CHECK(resultSet(a, "p2", 6, 1) == expectedSet(a, "p2", {"bar/1"}));
}

TEST_CASE("only one die playable: must play the higher") {
  // 13/7 or 13/8, but 7/2 and 8/2 are blocked, so only one die can be used: the 6.
  const Abs a = pos({{13, 1}, {2, -2}}, 0, 0, 14, 13);
  CHECK(resultSet(a, "p1", 6, 5) == expectedSet(a, "p1", {"13/7"}));
}

TEST_CASE("must use both dice when an order allows it") {
  // 6 first is blocked (JSON 7), 5 then 6 works.
  const Abs a = pos({{13, 1}, {7, -2}}, 0, 0, 14, 13);
  CHECK(resultSet(a, "p1", 6, 5) == expectedSet(a, "p1", {"13/8 8/2"}));
}

TEST_CASE("hit sends the blot to the bar; passing over does not") {
  const Abs a = pos({{13, 1}, {8, -1}}, 0, 0, 14, 14);
  CHECK(resultSet(a, "p1", 5, 1) == expectedSet(a, "p1", {"13/8 8/7", "13/12 12/7"}));
}

TEST_CASE("bear-off with a larger die only from the highest point") {
  // Checkers on 5 and 2: the 6 bears off from 5, or from 4 after 5/4; never from 2 while 5 is occupied.
  const Abs a = pos({{5, 1}, {2, 1}, {20, -1}}, 0, 0, 13, 14);
  CHECK(resultSet(a, "p1", 6, 1) == expectedSet(a, "p1", {"5/off 2/1", "5/4 4/off"}));
}

TEST_CASE("bear-off for p2 (moves up, bears off past 24)") {
  // Mirror of the previous case: p2 on JSON 20 (its 5-point) and 23 (its 2-point).
  const Abs a = pos({{20, -1}, {23, -1}, {5, 1}}, 0, 0, 14, 13);
  CHECK(resultSet(a, "p2", 6, 1) == expectedSet(a, "p2", {"20/off 23/24", "20/21 21/off"}));
}

TEST_CASE("doubles: play as many as possible") {
  // 13/9, then 9/5 is blocked: one of four 4s.
  const Abs a = pos({{13, 1}, {5, -2}}, 0, 0, 14, 13);
  CHECK(resultSet(a, "p1", 4, 4) == expectedSet(a, "p1", {"13/9"}));
}

TEST_CASE("doubles: every split of four 1s between two checkers") {
  const Abs a = pos({{6, 2}, {24, -1}}, 0, 0, 13, 14);
  CHECK(resultSet(a, "p1", 1, 1) ==
        expectedSet(a, "p1", {"6/5 5/4 4/3 3/2", "6/5 5/4 4/3 6/5", "6/5 5/4 6/5 5/4"}));
}

TEST_CASE("doubles: the game ends before all dice are used") {
  const Abs a = pos({{3, 1}, {13, -15}}, 0, 0, 14, 0);
  CHECK(resultSet(a, "p1", 5, 5) == expectedSet(a, "p1", {"3/off"}));
}

TEST_CASE("opening 3-1 includes making the 5-point") {
  const Abs a = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);
  const auto got = resultSet(a, "p1", 3, 1);
  CHECK(got.count(applySteps(a, "p1", "8/5 6/5").str()) == 1);
  CHECK(got.count(applySteps(a, "p1", "24/21 21/20").str()) == 1);
  CHECK(got.count(applySteps(a, "p1", "13/10 6/5").str()) == 1);
}

TEST_CASE("every play uses the maximum number of dice and conserves checkers") {
  const Abs a = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);
  for (int d1 = 1; d1 <= 6; d1++) {
    for (int d2 = 1; d2 <= 6; d2++) {
      const bg::EvalRequest req = bg::parseEvalRequest(toJson(a, "p1", d1, d2));
      const auto plays = bg::legalPlays(req.board, d1, d2);
      CHECK(!plays.empty());
      for (const bg::Play& p : plays) {
        CHECK(p.count == (d1 == d2 ? 4 : 2));
        int me = 0, opp = 0;
        for (int i = 0; i < bg::kSlots; i++) {
          me += p.result.me[i];
          opp += p.result.opp[i];
        }
        CHECK(me == 15);
        CHECK(opp == 15);
      }
    }
  }
}
