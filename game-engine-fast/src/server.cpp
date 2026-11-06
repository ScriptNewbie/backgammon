// game-engine-fast HTTP server: GET /health, POST /evaluate?ply=N (docs/domain/game-engine-fast.md).
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>

#include <httplib.h>

#include "evaluate.hpp"
#include "net_gpu.hpp"

namespace {

const char* envOr(const char* name, const char* fallback) {
  const char* v = std::getenv(name);
  return v && *v ? v : fallback;
}

// Strict 0..kMaxPly. Absent means 0.
bool parsePly(const httplib::Request& req, int& ply) {
  ply = 0;
  if (!req.has_param("ply")) return true;
  const std::string s = req.get_param_value("ply");
  if (s.size() != 1 || s[0] < '0' || s[0] > '0' + bg::kMaxPly) return false;
  ply = s[0] - '0';
  return true;
}

void sendError(httplib::Response& res, const std::string& message) {
  res.status = 400;
  res.set_content(nlohmann::json{{"error", message}}.dump(), "application/json");
}

}  // namespace

int main() {
  const std::string modelPath = envOr("MODEL_PATH", "/models/cubeless-fast.onnx");
  const int port = std::atoi(envOr("PORT", "3001"));
  if (!bg::cudaAvailable()) {
    std::fprintf(stderr, "game-engine-fast: no CUDA device (is the container started with gpus: all?)\n");
    return 1;
  }
  std::unique_ptr<bg::Net> net;
  try {
    net = std::make_unique<bg::GpuNet>(bg::loadOnnxMlp(modelPath));
  } catch (const std::exception& e) {
    std::fprintf(stderr, "game-engine-fast: cannot load %s: %s\n", modelPath.c_str(), e.what());
    return 1;
  }

  httplib::Server server;
  server.set_logger([](const httplib::Request& req, const httplib::Response& res) {
    std::printf("%s %s %d\n", req.method.c_str(), req.path.c_str(), res.status);
    std::fflush(stdout);
  });
  server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
    res.set_content(R"({"ok":true})", "application/json");
  });
  server.Post("/evaluate", [&](const httplib::Request& req, httplib::Response& res) {
    int ply = 0;
    if (!parsePly(req, ply)) return sendError(res, "ply must be an integer 0-" + std::to_string(bg::kMaxPly));
    nlohmann::json body;
    try {
      body = nlohmann::json::parse(req.body);
    } catch (const std::exception&) {
      return sendError(res, "invalid json");
    }
    try {
      const bg::EvalRequest eval = bg::parseEvalRequest(body);
      const auto t0 = std::chrono::steady_clock::now();
      const nlohmann::ordered_json out = bg::evaluate(eval, ply, *net);
      const double ms =
          std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
      std::printf("  ply=%d moves=%zu onRoll=%s dice=%d-%d %.2fms\n", ply, out["moves"].size(),
                  bg::playerName(eval.onRoll), eval.die1, eval.die2, ms);
      res.set_content(out.dump(), "application/json");
    } catch (const std::invalid_argument& e) {
      return sendError(res, e.what());
    }
  });

  std::printf("game-engine-fast listening on :%d model=%s\n", port, modelPath.c_str());
  std::fflush(stdout);
  if (!server.listen("0.0.0.0", port)) {
    std::fprintf(stderr, "game-engine-fast: cannot listen on :%d\n", port);
    return 1;
  }
  return 0;
}
