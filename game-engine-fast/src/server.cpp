// game-engine-fast HTTP server: GET /health, POST /evaluate?ply=N, POST /cube?ply=N (docs/domain/game-engine-fast.md).
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>

#include <httplib.h>

#include "http.hpp"
#include "match.hpp"
#include "net_gpu.hpp"
#include "search.hpp"

namespace {

const char* envOr(const char* name, const char* fallback) {
  const char* v = std::getenv(name);
  return v && *v ? v : fallback;
}

}  // namespace

int main() {
  const std::string modelPath = envOr("MODEL_PATH", "/models/cubeless-fast.onnx");
  const int port = std::atoi(envOr("PORT", "3001"));
  if (!bg::cudaAvailable()) {
    std::fprintf(stderr, "game-engine-fast: no CUDA device (is the container started with gpus: all?)\n");
    return 1;
  }
  try {
    bg::met();  // fail at startup, not on the first match request
  } catch (const std::exception& e) {
    std::fprintf(stderr, "game-engine-fast: %s\n", e.what());
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
  bg::registerRoutes(server, *net);

  std::printf("game-engine-fast listening on :%d model=%s max-leaf-visits=%lld\n", port, modelPath.c_str(),
              static_cast<long long>(bg::defaultMaxLeafVisits()));
  std::fflush(stdout);
  if (!server.listen("0.0.0.0", port)) {
    std::fprintf(stderr, "game-engine-fast: cannot listen on :%d\n", port);
    return 1;
  }
  return 0;
}
