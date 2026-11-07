#include <cmath>
#include <cstdlib>
#include <fstream>
#include <random>
#include <vector>

#include <doctest/doctest.h>

#include "features.hpp"
#include "movegen.hpp"
#include "net_gpu.hpp"

TEST_CASE("ONNX reader rejects files that are not the cubeless MLP") {
  CHECK_THROWS(bg::parseOnnxMlp(""));
  CHECK_THROWS(bg::parseOnnxMlp("not a protobuf at all"));
}

TEST_CASE("GPU forward matches the CPU reference on the real model") {
  const char* path = std::getenv("MODEL_PATH");
  if (path == nullptr || !std::ifstream(path).good()) {
    MESSAGE("skipped: MODEL_PATH not set or missing (export cubeless-fast.onnx first)");
    return;
  }
  REQUIRE(bg::cudaAvailable());
  const bg::Mlp mlp = bg::loadOnnxMlp(path);
  CHECK(mlp.inputSize() == bg::kFeatureSize);
  CHECK(mlp.outputSize() == 5);

  bg::CpuNet cpu(mlp);
  bg::GpuNet gpu(mlp);
  std::mt19937 rng(7);
  std::uniform_real_distribution<float> u(0.0f, 1.0f);
  for (int n : {1, 7, 1000}) {
    std::vector<float> in(static_cast<size_t>(n) * bg::kFeatureSize);
    for (float& v : in) v = u(rng);
    std::vector<float> a(static_cast<size_t>(n) * 5), b(a.size());
    cpu.infer(in.data(), n, a.data());
    gpu.infer(in.data(), n, b.data());
    float worst = 0;
    for (size_t i = 0; i < a.size(); i++) {
      CHECK(b[i] >= 0.0f);
      CHECK(b[i] <= 1.0f);
      worst = std::fmax(worst, std::fabs(a[i] - b[i]));
    }
    INFO("batch ", n, " max |cpu - gpu| = ", worst);
    CHECK(worst < 1e-5f);
  }
}

TEST_CASE("GPU featurize + forward from boards matches the CPU reference") {
  const char* path = std::getenv("MODEL_PATH");
  if (path == nullptr || !std::ifstream(path).good()) {
    MESSAGE("skipped: MODEL_PATH not set or missing (export cubeless-fast.onnx first)");
    return;
  }
  const bg::Mlp mlp = bg::loadOnnxMlp(path);
  bg::CpuNet cpu(mlp);
  bg::GpuNet gpu(mlp);
  // Real positions: every opening play for every roll, opponent to move, and a few rolls deeper.
  bg::Board opening{};
  const int pts[][2] = {{6, 5}, {8, 3}, {13, 5}, {24, 2}};
  for (const auto& p : pts) {
    opening.me[p[0]] = static_cast<uint8_t>(p[1]);
    opening.opp[p[0]] = static_cast<uint8_t>(p[1]);
  }
  std::vector<bg::Board> boards;
  for (int a = 1; a <= 6; a++) {
    for (int b = a; b <= 6; b++) {
      for (const bg::Play& play : bg::legalPlays(opening, a, b)) {
        const bg::Board next = bg::flipped(play.result);
        boards.push_back(next);
        for (const bg::Play& reply : bg::legalPlays(next, 6 - a + 1, b)) boards.push_back(bg::flipped(reply.result));
      }
    }
  }
  REQUIRE(boards.size() > 1000);
  const int n = static_cast<int>(boards.size());
  std::vector<float> a(static_cast<size_t>(n) * 5), b(a.size());
  cpu.inferBoards(boards.data(), n, a.data());
  gpu.inferBoards(boards.data(), n, b.data());
  float worst = 0;
  for (size_t i = 0; i < a.size(); i++) worst = std::fmax(worst, std::fabs(a[i] - b[i]));
  INFO(n, " boards, max |cpu - gpu| = ", worst);
  CHECK(worst < 1e-5f);
}

TEST_CASE("GPU pipeline: many sub-batches over several lanes still matches the CPU reference") {
  const char* path = std::getenv("MODEL_PATH");
  if (path == nullptr || !std::ifstream(path).good()) {
    MESSAGE("skipped: MODEL_PATH not set or missing (export cubeless-fast.onnx first)");
    return;
  }
  const bg::Mlp mlp = bg::loadOnnxMlp(path);
  bg::CpuNet cpu(mlp);

  // Real boards, as in the test above, so a wrong row order or lane mix-up shows up as a diff.
  bg::Board opening{};
  const int pts[][2] = {{6, 5}, {8, 3}, {13, 5}, {24, 2}};
  for (const auto& p : pts) {
    opening.me[p[0]] = static_cast<uint8_t>(p[1]);
    opening.opp[p[0]] = static_cast<uint8_t>(p[1]);
  }
  std::vector<bg::Board> boards;
  for (int a = 1; a <= 6; a++) {
    for (int b = a; b <= 6; b++) {
      for (const bg::Play& play : bg::legalPlays(opening, a, b)) {
        const bg::Board next = bg::flipped(play.result);
        boards.push_back(next);
        for (const bg::Play& reply : bg::legalPlays(next, 7 - a, b)) boards.push_back(bg::flipped(reply.result));
      }
    }
  }
  const int n = static_cast<int>(boards.size());
  REQUIRE(n > 3000);
  std::vector<float> want(static_cast<size_t>(n) * 5);
  cpu.inferBoards(boards.data(), n, want.data());

  struct Cfg { int sub, lanes; };
  for (const Cfg cfg : {Cfg{1, 1}, Cfg{7, 2}, Cfg{500, 3}, Cfg{n, 2}, Cfg{n + 100, 4}}) {
    bg::GpuNet gpu(mlp, cfg.sub, cfg.lanes);
    CHECK(gpu.subBatch() == cfg.sub);
    CHECK(gpu.lanes() == cfg.lanes);
    if (cfg.sub == 1) {  // one row per sub-batch: only check a prefix, it is slow
      std::vector<float> got(5 * 200);
      gpu.inferBoards(boards.data(), 200, got.data());
      for (size_t i = 0; i < got.size(); i++) CHECK(std::fabs(got[i] - want[i]) < 1e-5f);
      continue;
    }
    std::vector<float> got(want.size(), -1.0f);
    gpu.inferBoards(boards.data(), n, got.data());
    float worst = 0;
    for (size_t i = 0; i < got.size(); i++) worst = std::fmax(worst, std::fabs(got[i] - want[i]));
    INFO("sub ", cfg.sub, " lanes ", cfg.lanes, " max |cpu - gpu| = ", worst);
    CHECK(worst < 1e-5f);
    // Same net object, second call: lanes must start clean.
    std::fill(got.begin(), got.end(), -1.0f);
    gpu.inferBoards(boards.data(), n, got.data());
    float again = 0;
    for (size_t i = 0; i < got.size(); i++) again = std::fmax(again, std::fabs(got[i] - want[i]));
    CHECK(again < 1e-5f);
  }

  // Feature-input path across sub-batches.
  std::vector<float> features(static_cast<size_t>(1234) * bg::kFeatureSize);
  for (int i = 0; i < 1234; i++) bg::featurize(boards[i], features.data() + static_cast<size_t>(i) * bg::kFeatureSize);
  bg::GpuNet small(mlp, 300, 2);
  std::vector<float> got(static_cast<size_t>(1234) * 5);
  small.infer(features.data(), 1234, got.data());
  float worst = 0;
  for (size_t i = 0; i < got.size(); i++) worst = std::fmax(worst, std::fabs(got[i] - want[i]));
  CHECK(worst < 1e-5f);
}
