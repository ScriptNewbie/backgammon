#pragma once
// HTTP routes of game-engine-fast (docs/domain/game-engine-fast.md), separate from main() so tests
// can serve them with a fake net.
#include <httplib.h>

#include "onnx_mlp.hpp"

namespace bg {

// GET /health, POST /evaluate?ply=N.
//   200: evaluate response.
//   400: invalid ply / JSON / position, ply above the search limit, or search too large.
//   500: anything else (e.g. a CUDA error), as {"error": "..."}.
// `log` prints one line per evaluate request with search stats.
void registerRoutes(httplib::Server& server, Net& net, bool log = true);

}  // namespace bg
