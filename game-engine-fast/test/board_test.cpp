#include <doctest/doctest.h>

#include "board.hpp"
#include "helpers.hpp"

using namespace bgtest;

TEST_CASE("JSON → STM board for p1 and p2 on roll") {
  // p1: 2 on point 24, 13 off. p2: 1 on JSON point 1 (its own 24-point), 1 on the bar, 13 off.
  const Abs a = pos({{24, 2}, {1, -1}}, 0, 1, 13, 13);

  const bg::EvalRequest r1 = bg::parseEvalRequest(toJson(a, "p1", 3, 1));
  CHECK(r1.onRoll == bg::Player::P1);
  CHECK(r1.board.me[24] == 2);
  CHECK(r1.board.me[bg::kOff] == 13);
  CHECK(r1.board.opp[24] == 1);  // p2's own 24-point = JSON 1
  CHECK(r1.board.opp[bg::kBar] == 1);

  const bg::EvalRequest r2 = bg::parseEvalRequest(toJson(a, "p2", 3, 1));
  CHECK(r2.onRoll == bg::Player::P2);
  CHECK(r2.board.me[24] == 1);
  CHECK(r2.board.me[bg::kBar] == 1);
  CHECK(r2.board.opp[24] == 2);  // p1's 24-point
  CHECK(bg::sameBoard(bg::flipped(r1.board), r2.board));

  CHECK(resultToAbs(r1.board, bg::Player::P1).str() == a.str());
  CHECK(resultToAbs(r2.board, bg::Player::P2).str() == a.str());
}

TEST_CASE("invalid positions are rejected") {
  const Abs a = pos({{24, 2}, {1, -2}}, 0, 0, 13, 13);
  nlohmann::json j = toJson(a, "p1", 3, 1);

  auto rejects = [](nlohmann::json body, const char* message) {
    try {
      bg::parseEvalRequest(body);
      FAIL("accepted invalid body: " << message);
    } catch (const std::invalid_argument& e) {
      CHECK(std::string(e.what()) == message);
    }
  };
  { auto b = j; b["dice"] = {0, 3}; rejects(b, "dice must be two ints 1-6"); }
  { auto b = j; b["dice"] = nullptr; rejects(b, "dice must be two ints 1-6"); }
  { auto b = j; b["onRoll"] = "p3"; rejects(b, "onRoll must be p1 or p2"); }
  { auto b = j; b["points"].erase(0); rejects(b, "points must be length 24"); }
  { auto b = j; b["off"]["p1"] = 12; rejects(b, "checker counts must be 15 (p1=14 p2=15)"); }
  { auto b = j; b["cube"]["value"] = 3; rejects(b, "cube.value must be 1, 2, 4, 8, 16, 32, or 64"); }
  { auto b = j; b.erase("match"); rejects(b, "match must be an object or null"); }
  CHECK_NOTHROW(bg::parseEvalRequest(j));
}

TEST_CASE("game result for the mover") {
  bg::Board b{};
  b.me[bg::kOff] = 15;
  b.opp[bg::kOff] = 1;
  b.opp[10] = 14;
  CHECK(bg::moverResult(b) == bg::Result::Single);

  b.opp[bg::kOff] = 0;
  b.opp[10] = 15;
  CHECK(bg::moverResult(b) == bg::Result::Gammon);

  b.opp[10] = 14;
  b.opp[19] = 1;  // in the winner's home board
  CHECK(bg::moverResult(b) == bg::Result::Backgammon);

  b.opp[19] = 0;
  b.opp[bg::kBar] = 1;
  CHECK(bg::moverResult(b) == bg::Result::Backgammon);

  b.me[bg::kOff] = 14;
  b.me[3] = 1;
  CHECK(bg::moverResult(b) == bg::Result::None);
}
