// HTTP getmoves sidecar for the MIT Hedgehog engine.
//
// This file is compiled inside a checkout of
// https://gitlab.com/eranlambooij/hedgehog-public (MIT). It is not built by
// this repo. Copy it to examples/getmoves_server.cpp in that checkout, or
// build docs/integrations/hedgehog/Dockerfile, which does that.
//
//   make NATIVE=0 example
//   curl -fsSL -o httplib.h https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.63.0/httplib.h
//   g++ -O3 -std=c++17 -I. -Isrc -Ilib -Ihwy -o build/getmoves_server examples/getmoves_server.cpp $(find obj -maxdepth 1 -name '*.o') -lm -lpthread
//   ./build/getmoves_server aureus_v0.12_2026-09-26.ogxf 8090
//
// HTTP is cpp-httplib. Accept stays live during a search. Eval calls share
// one NNEnsembleContext under a mutex, so a second move waits.
//
// GET /health
// POST /v1/moves   {"ogid":"...","ply":0|1}
//
// GnuBG ply. 0 is a direct net eval of each successor. 1 is the community
// expectiminimax one roll past that successor (the public engine's maximum).
// Each move's probabilities are from the player who just moved. `ogid` is the
// successor, with the opponent to move. Checker fields are what the client matches.

#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <locale>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#include "httplib.h"

#include "src/backgammon.hpp"
#include "src/eval/equity.h"
#include "src/eval/eval_ensemble.h"
#include "src/explore/explore_delta.h"
#include "src/ogid.h"
#include "src/search/search_community.hpp"

namespace {

std::string base_name(const std::string& path) {
  const auto slash = path.find_last_of("/\\");
  if (slash == std::string::npos) return path;
  return path.substr(slash + 1);
}

std::string json_string_field(const std::string& body, const char* key) {
  const std::string pat = std::string("\"") + key + "\"";
  const auto key_at = body.find(pat);
  if (key_at == std::string::npos) return "";
  const auto open = body.find('"', key_at + pat.size());
  if (open == std::string::npos) return "";
  const auto close = body.find('"', open + 1);
  if (close == std::string::npos) return "";
  return body.substr(open + 1, close - open - 1);
}

int json_int_field(const std::string& body, const char* key, int fallback) {
  const std::string pat = std::string("\"") + key + "\"";
  const auto key_at = body.find(pat);
  if (key_at == std::string::npos) return fallback;
  const auto num = body.find_first_of("-0123456789", key_at + pat.size());
  if (num == std::string::npos) return fallback;
  return std::atoi(body.c_str() + num);
}

EvalResult score_successor(NNEnsembleContext* ctx, BoardState succ, int mover, int ply) {
  const int opp = 1 - mover;
  if (ply <= 0) {
    EvalResult ev = eval_ensemble(succ, opp, ctx);
    return eval_flip(&ev);
  }
  return ogx_community::community_search_ensemble(ctx, succ, mover, opp, ply, nullptr);
}

std::string moves_json(NNEnsembleContext* ctx, const std::string& ogid, int ply) {
  BoardState state;
  OGIDInfo info;
  ogid_info_init(&info);
  if (ogid_parse_full(ogid.c_str(), &state, &info) != OGID_OK) {
    return "";
  }
  if (info.dice[0] < 1 || info.dice[0] > 6 || info.dice[1] < 1 || info.dice[1] > 6) {
    return "";
  }
  const int mover = info.color;
  std::vector<BoardState> successors(MAX_SUCCESSOR_STATES);
  const int n = explore_delta(
      state, mover, static_cast<uint8_t>(info.dice[0]), static_cast<uint8_t>(info.dice[1]),
      successors.data());

  std::ostringstream out;
  out.imbue(std::locale::classic());
  out << "{\"ply\":" << ply << ",\"moves\":[";
  bool first = true;
  for (int i = 0; i < n; i++) {
    char formatted[OGID_MAX_LENGTH];
    if (ogid_format(successors[i], 1 - mover, formatted) < 0) continue;
    const EvalResult ev = score_successor(ctx, successors[i], mover, ply);
    const float equity = eval_equity(&ev);
    if (!first) out << ',';
    first = false;
    out << "{\"ogid\":\"" << formatted << "\""
        << ",\"win\":" << ev.win
        << ",\"gammon_win\":" << ev.gammon_win
        << ",\"bg_win\":" << ev.bg_win
        << ",\"gammon_loss\":" << ev.gammon_loss
        << ",\"bg_loss\":" << ev.bg_loss
        << ",\"equity\":" << equity << "}";
  }
  out << "]}";
  return out.str();
}

void set_json(httplib::Response& res, int status, const std::string& body) {
  res.status = status;
  res.set_content(body, "application/json");
}

httplib::Server* g_server = nullptr;

void on_stop(int) {
  if (g_server) g_server->stop();
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: %s <model.ogxf> [port]\n", argv[0]);
    return 2;
  }
  const std::string model_path = argv[1];
  const int port = argc >= 3 ? std::atoi(argv[2]) : 8090;
  const std::string model = base_name(model_path);

  std::signal(SIGPIPE, SIG_IGN);

  NNEnsembleContext* ctx = ensemble_context_create(model_path.c_str(), nullptr);
  if (!ctx) {
    std::fprintf(stderr, "error: could not load model: %s\n", model_path.c_str());
    const char* detail = ogx::nn::nn_io_last_error_detail();
    if (detail && detail[0]) std::fprintf(stderr, "  %s\n", detail);
    return 1;
  }

  std::mutex eval_mu;
  httplib::Server svr;
  g_server = &svr;
  std::signal(SIGTERM, on_stop);
  std::signal(SIGINT, on_stop);

  // One search holds a worker for the whole ply. Spare workers answer /health
  // and queue another move. The model context is not safe to share.
  svr.new_task_queue = [] {
    return new httplib::ThreadPool(/*base_threads=*/4, /*max_threads=*/0, /*max_queued_requests=*/16);
  };
  svr.set_read_timeout(30, 0);
  svr.set_write_timeout(30, 0);
  svr.set_keep_alive_timeout(30);
  svr.set_payload_max_length(1024 * 1024);
  svr.set_exception_handler([](const httplib::Request&, httplib::Response& res, std::exception_ptr ep) {
    try {
      if (ep) std::rethrow_exception(ep);
    } catch (const std::exception& ex) {
      std::fprintf(stderr, "hedgehog search error: %s\n", ex.what());
    } catch (...) {
      std::fprintf(stderr, "hedgehog search error\n");
    }
    set_json(res, 500, "{\"error\":\"search failed\"}");
  });

  svr.Get("/health", [model](const httplib::Request&, httplib::Response& res) {
    set_json(res, 200, std::string("{\"ok\":true,\"model\":\"") + model + "\",\"maxPly\":1}");
  });

  svr.Post("/v1/moves", [ctx, &eval_mu](const httplib::Request& req, httplib::Response& res) {
    const std::string ogid = json_string_field(req.body, "ogid");
    int ply = json_int_field(req.body, "ply", 1);
    if (ply < 0) ply = 0;
    if (ply > 1) ply = 1;
    if (ogid.empty() || ogid.find('"') != std::string::npos) {
      set_json(res, 400, "{\"error\":\"ogid required\"}");
      return;
    }
    std::string json;
    {
      std::lock_guard<std::mutex> lock(eval_mu);
      json = moves_json(ctx, ogid, ply);
    }
    if (json.empty()) {
      set_json(res, 400, "{\"error\":\"could not parse ogid or dice\"}");
      return;
    }
    set_json(res, 200, json);
  });

  std::fprintf(stderr, "hedgehog getmoves on :%d model %s (ply max 1)\n", port, model.c_str());
  if (!svr.listen("0.0.0.0", port)) {
    std::fprintf(stderr, "error: could not listen on :%d\n", port);
    return 1;
  }
  return 0;
}
