// The featurizer must reproduce training-ground/fixtures/features.json (docs/domain/features.md).
#include <cmath>
#include <cstdlib>
#include <fstream>

#include <doctest/doctest.h>

#include "features.hpp"
#include "position_json.hpp"

TEST_CASE("golden feature vectors") {
  const char* path = std::getenv("FEATURES_FIXTURE");
  REQUIRE_MESSAGE(path != nullptr, "set FEATURES_FIXTURE (Compose test service does)");
  std::ifstream f(path);
  REQUIRE_MESSAGE(f.good(), "cannot open " << path);
  const nlohmann::json cases = nlohmann::json::parse(f);
  REQUIRE(cases.size() >= 6);
  for (const auto& c : cases) {
    const bg::EvalRequest req = bg::parseEvalRequest(c["position"]);
    float got[bg::kFeatureSize];
    bg::featurize(req.board, got);
    const auto& want = c["vector"];
    REQUIRE(want.size() == bg::kFeatureSize);
    for (int i = 0; i < bg::kFeatureSize; i++) {
      INFO(c["id"].get<std::string>(), " index ", i);
      CHECK(std::fabs(got[i] - want[i].get<double>()) < 1e-6);
    }
  }
}
