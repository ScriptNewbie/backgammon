// HTTP sidecar for the MIT Hedgehog engine: checker play and cube decisions.
//
// This file is compiled inside a checkout of
// https://gitlab.com/eranlambooij/hedgehog-public (MIT). It is not built by
// this repo. Copy it to examples/getmoves_server.cpp in that checkout, or
// build docs/integrations/hedgehog/Dockerfile, which does that. It only calls
// the engine's public headers; no engine source is copied here.
//
//   make NATIVE=0 example
//   curl -fsSL -o httplib.h https://raw.githubusercontent.com/yhirose/cpp-httplib/v0.63.0/httplib.h
//   g++ -O3 -std=c++17 -I. -Isrc -Ilib -Ihwy -o build/getmoves_server examples/getmoves_server.cpp $(find obj -maxdepth 1 -name '*.o') -lm -lpthread
//   ./build/getmoves_server aureus_v0.12_2026-09-26.ogxf 8090
//
// HTTP is cpp-httplib. Accept stays live during a search. Eval calls share
// one NNEnsembleContext under a mutex, so a second request waits.
//
// GET  /health
// POST /v1/moves   {"ogid":"...","ply":0|1}   OGID with dice, mover on roll
// POST /v1/cube    {"ogid":"...","ply":0|1}   OGID without dice, doubler on roll
//
// GnuBG ply. 0 is a direct net eval. 1 is the community expectiminimax one
// roll deep (the public engine's maximum): past each successor for a checker
// play, over the doubler's own roll for a cube decision.
//
// Every decision is the engine's own, at the cube, score, and Crawford state
// the OGID carries:
// - Checker plays are ranked best first by match_emg_equity() at the mover's
//   score and cube value (money equity in a money game), which is what the
//   engine's header names as its checker currency at a score. Inside the
//   search, interior choices use eval_equity_match() at the same score.
// - Cube: cube_evaluate_double_match_capped() / cube_should_take_match_capped()
//   at a match score, cube_evaluate_double_capped() / cube_should_take_capped()
//   for money (Jacoby off, standard 64 cap), at DEFAULT_CUBE_EFFICIENCY. A dead
//   cube (owner `D`) never doubles.

#include <algorithm>
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
#include "src/cube/cube_decision.h"
#include "src/cube/cubeful_equity.h"
#include "src/eval/equity.h"
#include "src/eval/eval_ensemble.h"
#include "src/explore/explore_delta.h"
#include "src/ogid.h"
#include "src/ogid_cube.hpp"
#include "src/search/search_community.hpp"

namespace {

// Wire version. The TypeScript client refuses a sidecar that does not report it.
constexpr int kApiVersion = 2;

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

// Position, cube, and score from one OGID, from `player`'s seat.
struct Seat {
  CubeMatchScore score_storage;
  const CubeMatchScore* score = nullptr;  // NULL for money
  EquityMatchContext match_storage;
  const EquityMatchContext* match = nullptr;  // NULL for money
};

Seat seat_for(const OGIDInfo& info, int player, int cube_value) {
  Seat s;
  s.score = ogid_cube_match_score(&info, player, &s.score_storage);
  if (s.score) {
    s.match_storage = equity_match_context(
        s.score->match_length, s.score->my_score, s.score->opp_score, cube_value);
    s.match = &s.match_storage;
  }
  return s;
}

// Successor value from the mover's side.
EvalResult score_successor(NNEnsembleContext* ctx, BoardState succ, int mover, int ply,
                           const EquityMatchContext* match) {
  const int opp = 1 - mover;
  if (ply <= 0) {
    EvalResult ev = eval_ensemble(succ, opp, ctx);
    return eval_flip(&ev);
  }
  return ogx_community::community_search_ensemble(ctx, succ, mover, opp, ply, nullptr, match);
}

struct ScoredMove {
  std::string ogid;
  EvalResult ev;
  float equity;        // cubeless money equity
  float match_equity;  // ranking key: EMG at the score, money equity in money
};

std::string moves_json(NNEnsembleContext* ctx, const std::string& ogid, int ply, std::string* error) {
  BoardState state;
  OGIDInfo info;
  ogid_info_init(&info);
  if (ogid_parse_full(ogid.c_str(), &state, &info) != OGID_OK) {
    *error = "could not parse ogid";
    return "";
  }
  if (info.dice[0] < 1 || info.dice[0] > 6 || info.dice[1] < 1 || info.dice[1] > 6) {
    *error = "moves need dice";
    return "";
  }
  const int mover = info.color;
  const int cube_value = ogid_cube_actual_value(&info.cube);
  const Seat seat = seat_for(info, mover, cube_value);

  std::vector<BoardState> successors(MAX_SUCCESSOR_STATES);
  const int n = explore_delta(
      state, mover, static_cast<uint8_t>(info.dice[0]), static_cast<uint8_t>(info.dice[1]),
      successors.data());

  std::vector<ScoredMove> scored;
  scored.reserve(n > 0 ? n : 0);
  for (int i = 0; i < n; i++) {
    char formatted[OGID_MAX_LENGTH];
    if (ogid_format(successors[i], 1 - mover, formatted) < 0) continue;
    const EvalResult ev = score_successor(ctx, successors[i], mover, ply, seat.match);
    scored.push_back({formatted, ev, eval_equity(&ev), match_emg_equity(&ev, seat.score, cube_value)});
  }
  // Best first. Stable, so a tie keeps generation order, as the engine's own
  // strict `>` selection does.
  std::stable_sort(scored.begin(), scored.end(), [](const ScoredMove& a, const ScoredMove& b) {
    return a.match_equity > b.match_equity;
  });

  std::ostringstream out;
  out.imbue(std::locale::classic());
  out << "{\"ply\":" << ply << ",\"moves\":[";
  for (size_t i = 0; i < scored.size(); i++) {
    const ScoredMove& m = scored[i];
    if (i > 0) out << ',';
    out << "{\"ogid\":\"" << m.ogid << "\""
        << ",\"win\":" << m.ev.win
        << ",\"gammon_win\":" << m.ev.gammon_win
        << ",\"bg_win\":" << m.ev.bg_win
        << ",\"gammon_loss\":" << m.ev.gammon_loss
        << ",\"bg_loss\":" << m.ev.bg_loss
        << ",\"equity\":" << m.equity
        << ",\"match_equity\":" << m.match_equity << "}";
  }
  out << "]}";
  return out.str();
}

bool is_double(CubeAction action) {
  return action == CUBE_DOUBLE_TAKE || action == CUBE_DOUBLE_PASS ||
         action == CUBE_REDOUBLE_TAKE || action == CUBE_REDOUBLE_PASS;
}

std::string cube_json(NNEnsembleContext* ctx, const std::string& ogid, int ply, std::string* error) {
  BoardState state;
  OGIDInfo info;
  ogid_info_init(&info);
  if (ogid_parse_full(ogid.c_str(), &state, &info) != OGID_OK) {
    *error = "could not parse ogid";
    return "";
  }
  if (info.dice[0] != 0 || info.dice[1] != 0) {
    *error = "cube decisions are asked before the roll; drop the dice";
    return "";
  }
  const int doubler = info.color;
  const int taker = 1 - doubler;
  const int cube_value = ogid_cube_actual_value(&info.cube);
  const CubeState cube = ogid_cube_state(&info);
  const bool dead = info.cube.owner == OGID_CUBE_DEAD;
  const Seat d = seat_for(info, doubler, cube_value);
  const Seat t = seat_for(info, taker, cube_value);
  const float x = DEFAULT_CUBE_EFFICIENCY;

  // The position with the doubler on roll, from the doubler's side.
  const EvalResult e_doubler =
      ply <= 0 ? eval_ensemble(state, doubler, ctx)
               : ogx_community::community_search_ensemble(ctx, state, doubler, doubler, ply, nullptr,
                                                          d.match);
  const EvalResult e_taker = eval_flip(&e_doubler);

  CubeDecision decision{};
  bool available = false;
  if (!dead) {
    available = cube_can_double_at_score(&cube, static_cast<uint8_t>(doubler), d.score,
                                         CUBE_LIMIT_UNSET) != 0;
    decision = d.score
                   ? cube_evaluate_double_match_capped(&e_doubler, x, &cube, static_cast<uint8_t>(doubler),
                                                       d.score, CUBE_LIMIT_UNSET)
                   : cube_evaluate_double_capped(&e_doubler, x, &cube, static_cast<uint8_t>(doubler),
                                                 /*jacoby=*/0, CUBE_LIMIT_UNSET);
  } else {
    decision.action = CUBE_NO_DOUBLE;
  }
  const bool offer = available && is_double(decision.action);
  const bool take = t.score ? cube_should_take_match_capped(&e_taker, x, &cube, t.score, CUBE_LIMIT_UNSET) != 0
                            : cube_should_take_capped(&e_taker, x, &cube, CUBE_LIMIT_UNSET) != 0;

  std::ostringstream out;
  out.imbue(std::locale::classic());
  out << "{\"ply\":" << ply
      << ",\"available\":" << (available ? "true" : "false")
      << ",\"action\":\"" << cube_action_str(decision.action) << "\""
      << ",\"offer\":\"" << (offer ? "double" : "no-double") << "\""
      << ",\"take\":\"" << (take ? "take" : "drop") << "\""
      << ",\"no_double\":" << decision.no_double_equity
      << ",\"double_take\":" << decision.double_take_equity
      << ",\"double_pass\":" << decision.double_pass_equity
      << ",\"currency\":\"" << (d.score ? "mwc" : "equity") << "\""
      << ",\"win\":" << e_doubler.win
      << ",\"gammon_win\":" << e_doubler.gammon_win
      << ",\"bg_win\":" << e_doubler.bg_win
      << ",\"gammon_loss\":" << e_doubler.gammon_loss
      << ",\"bg_loss\":" << e_doubler.bg_loss << "}";
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

struct Request {
  std::string ogid;
  int ply = 1;
};

bool read_request(const httplib::Request& req, httplib::Response& res, Request* out) {
  out->ogid = json_string_field(req.body, "ogid");
  out->ply = json_int_field(req.body, "ply", 1);
  if (out->ply < 0) out->ply = 0;
  if (out->ply > 1) out->ply = 1;
  if (out->ogid.empty() || out->ogid.find('"') != std::string::npos ||
      out->ogid.find('\\') != std::string::npos) {
    set_json(res, 400, "{\"error\":\"ogid required\"}");
    return false;
  }
  return true;
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
  // and queue another request. The model context is not safe to share.
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
    std::ostringstream out;
    out << "{\"ok\":true,\"model\":\"" << model << "\",\"maxPly\":1,\"api\":" << kApiVersion << "}";
    set_json(res, 200, out.str());
  });

  using Handler = std::string (*)(NNEnsembleContext*, const std::string&, int, std::string*);
  auto route = [ctx, &eval_mu](Handler handler) {
    return [ctx, &eval_mu, handler](const httplib::Request& req, httplib::Response& res) {
      Request r;
      if (!read_request(req, res, &r)) return;
      std::string json;
      std::string error;
      {
        std::lock_guard<std::mutex> lock(eval_mu);
        json = handler(ctx, r.ogid, r.ply, &error);
      }
      if (json.empty()) {
        set_json(res, 400, "{\"error\":\"" + error + "\"}");
        return;
      }
      set_json(res, 200, json);
    };
  };
  svr.Post("/v1/moves", route(&moves_json));
  svr.Post("/v1/cube", route(&cube_json));

  std::fprintf(stderr, "hedgehog sidecar api %d on :%d model %s (ply max 1)\n", kApiVersion, port,
               model.c_str());
  if (!svr.listen("0.0.0.0", port)) {
    std::fprintf(stderr, "error: could not listen on :%d\n", port);
    return 1;
  }
  return 0;
}
