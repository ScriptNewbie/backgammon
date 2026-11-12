#include "http.hpp"

#include <chrono>
#include <cstdio>
#include <string>

#include "evaluate.hpp"

namespace bg {
namespace {

// Strict 0..kMaxPly as one digit. Absent means 0.
bool parsePly(const httplib::Request& req, int& ply) {
  ply = 0;
  if (!req.has_param("ply")) return true;
  const std::string s = req.get_param_value("ply");
  if (s.size() != 1 || s[0] < '0' || s[0] > '0' + kMaxPly) return false;
  ply = s[0] - '0';
  return true;
}

void sendError(httplib::Response& res, int status, const std::string& message) {
  res.status = status;
  res.set_content(nlohmann::json{{"error", message}}.dump(), "application/json");
}

}  // namespace

void registerRoutes(httplib::Server& server, Net& net, bool log) {
  server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
    res.set_content(R"({"ok":true})", "application/json");
  });
  server.Post("/evaluate", [&net, log](const httplib::Request& req, httplib::Response& res) {
    int ply = 0;
    if (!parsePly(req, ply)) return sendError(res, 400, "ply must be an integer 0-" + std::to_string(kMaxPly));
    nlohmann::json body;
    try {
      body = nlohmann::json::parse(req.body);
    } catch (const std::exception&) {
      return sendError(res, 400, "invalid json");
    }
    try {
      const EvalRequest eval = parseEvalRequest(body);
      const auto t0 = std::chrono::steady_clock::now();
      SearchStats stats;
      const nlohmann::ordered_json out = evaluate(eval, ply, net, &stats);
      const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
      if (log) {
        std::printf(
            "  ply=%d moves=%zu onRoll=%s dice=%d-%d nodes=%lld leaves=%lld/%lld rounds=%lld %.2fms "
            "(threads %d: expand %.0f, merge %.0f, net %.0f, backup %.0f)\n",
            ply, out["moves"].size(), playerName(eval.onRoll), eval.die1, eval.die2,
            static_cast<long long>(stats.nodes), static_cast<long long>(stats.leaves),
            static_cast<long long>(stats.leafVisits), static_cast<long long>(stats.rounds), ms, stats.threads,
            stats.expandMs, stats.mergeMs, stats.netMs, stats.backupMs);
        std::fflush(stdout);
      }
      res.set_content(out.dump(), "application/json");
    } catch (const std::invalid_argument& e) {
      return sendError(res, 400, e.what());
    } catch (const SearchTooLarge& e) {
      if (log) std::printf("  ply=%d rejected: %s\n", ply, e.what());
      return sendError(res, 400, e.what());
    } catch (const std::exception& e) {
      std::fprintf(stderr, "evaluate failed: %s\n", e.what());
      return sendError(res, 500, std::string("internal error: ") + e.what());
    }
  });
  server.Post("/cube", [&net, log](const httplib::Request& req, httplib::Response& res) {
    int ply = 0;
    if (!parsePly(req, ply)) return sendError(res, 400, "ply must be an integer 0-" + std::to_string(kMaxPly));
    nlohmann::json body;
    try {
      body = nlohmann::json::parse(req.body);
    } catch (const std::exception&) {
      return sendError(res, 400, "invalid json");
    }
    try {
      const EvalRequest cube = parseCubeRequest(body);
      const auto t0 = std::chrono::steady_clock::now();
      SearchStats stats;
      const nlohmann::ordered_json out = cubeDecision(cube, ply, net, &stats);
      const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
      if (log) {
        std::printf("  cube ply=%d onRoll=%s available=%d offer=%s take=%s leaves=%lld %.2fms\n", ply,
                    playerName(cube.onRoll), out["available"].get<bool>() ? 1 : 0,
                    out["offer"].get<std::string>().c_str(),
                    out["take"].is_null() ? "null" : out["take"].get<std::string>().c_str(),
                    static_cast<long long>(stats.leaves), ms);
        std::fflush(stdout);
      }
      res.set_content(out.dump(), "application/json");
    } catch (const std::invalid_argument& e) {
      return sendError(res, 400, e.what());
    } catch (const SearchTooLarge& e) {
      if (log) std::printf("  cube ply=%d rejected: %s\n", ply, e.what());
      return sendError(res, 400, e.what());
    } catch (const std::exception& e) {
      std::fprintf(stderr, "cube failed: %s\n", e.what());
      return sendError(res, 500, std::string("internal error: ") + e.what());
    }
  });
}

}  // namespace bg
