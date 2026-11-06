#include <cmath>
#include <cstdlib>
#include <fstream>
#include <random>
#include <vector>

#include <doctest/doctest.h>

#include "features.hpp"
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
