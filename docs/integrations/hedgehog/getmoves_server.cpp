// HTTP getmoves sidecar for the MIT Hedgehog engine.
//
// This file is compiled inside a checkout of
// https://gitlab.com/eranlambooij/hedgehog-public (MIT). It is not built by
// this repo. Copy it to examples/getmoves_server.cpp in that checkout, or
// build docs/integrations/hedgehog/Dockerfile, which does that.
//
//   make NATIVE=0 example
//   g++ -O3 -std=c++17 -I. -Isrc -Ilib -Ihwy -o build/getmoves_server examples/getmoves_server.cpp $(find obj -maxdepth 1 -name '*.o') -lm -lpthread
//   ./build/getmoves_server aureus_v0.12_2026-09-26.ogxf 8090
//
// GET /health
// POST /v1/moves   {"ogid":"...","ply":0|1}
//
// GnuBG ply. 0 is a direct net eval of each successor. 1 is the community
// expectiminimax one roll past that successor (the public engine's maximum).
// Each move's probabilities are from the player who just moved. `ogid` is the
// successor, with the opponent to move. Checker fields are what the client matches.

#include <arpa/inet.h>
#include <netinet/in.h>
#include <signal.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cstdio>
#include <locale>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <string>
#include <vector>

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

void send_all(int fd, const std::string& msg) {
  size_t sent = 0;
  while (sent < msg.size()) {
    const ssize_t n = ::send(fd, msg.data() + sent, msg.size() - sent, 0);
    if (n <= 0) return;
    sent += static_cast<size_t>(n);
  }
}

void respond(int fd, int status, const std::string& body) {
  const char* text = status == 200 ? "OK" : "Bad Request";
  std::ostringstream head;
  head << "HTTP/1.1 " << status << ' ' << text << "\r\n"
       << "Content-Type: application/json\r\n"
       << "Content-Length: " << body.size() << "\r\n"
       << "Connection: close\r\n\r\n"
       << body;
  send_all(fd, head.str());
}

std::string read_http(int fd) {
  std::string data;
  char buf[4096];
  while (data.find("\r\n\r\n") == std::string::npos) {
    const ssize_t n = ::recv(fd, buf, sizeof(buf), 0);
    if (n <= 0) return "";
    data.append(buf, buf + n);
    if (data.size() > 1024 * 1024) return "";
  }
  const auto header_end = data.find("\r\n\r\n");
  const std::string headers = data.substr(0, header_end);
  size_t need = 0;
  const auto cl = headers.find("Content-Length:");
  if (cl == std::string::npos) {
    const auto cl2 = headers.find("content-length:");
    if (cl2 != std::string::npos) need = static_cast<size_t>(std::atoi(headers.c_str() + cl2 + 15));
  } else {
    need = static_cast<size_t>(std::atoi(headers.c_str() + cl + 15));
  }
  while (data.size() < header_end + 4 + need) {
    const ssize_t n = ::recv(fd, buf, sizeof(buf), 0);
    if (n <= 0) break;
    data.append(buf, buf + n);
    if (data.size() > 1024 * 1024) return "";
  }
  return data;
}

void handle(int fd, NNEnsembleContext* ctx, const std::string& model) {
  const std::string req = read_http(fd);
  if (req.empty()) return;
  const auto line_end = req.find("\r\n");
  const std::string start = req.substr(0, line_end);
  const auto header_end = req.find("\r\n\r\n");
  const std::string body = header_end == std::string::npos ? "" : req.substr(header_end + 4);

  if (start.rfind("GET /health", 0) == 0) {
    respond(fd, 200, std::string("{\"ok\":true,\"model\":\"") + model + "\",\"maxPly\":1}");
    return;
  }
  if (start.rfind("POST /v1/moves", 0) != 0) {
    respond(fd, 400, "{\"error\":\"use GET /health or POST /v1/moves\"}");
    return;
  }
  const std::string ogid = json_string_field(body, "ogid");
  int ply = json_int_field(body, "ply", 1);
  if (ply < 0) ply = 0;
  if (ply > 1) ply = 1;
  if (ogid.empty() || ogid.find('"') != std::string::npos) {
    respond(fd, 400, "{\"error\":\"ogid required\"}");
    return;
  }
  const std::string json = moves_json(ctx, ogid, ply);
  if (json.empty()) {
    respond(fd, 400, "{\"error\":\"could not parse ogid or dice\"}");
    return;
  }
  respond(fd, 200, json);
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

  ::signal(SIGPIPE, SIG_IGN);

  NNEnsembleContext* ctx = ensemble_context_create(model_path.c_str(), nullptr);
  if (!ctx) {
    std::fprintf(stderr, "error: could not load model: %s\n", model_path.c_str());
    const char* detail = ogx::nn::nn_io_last_error_detail();
    if (detail && detail[0]) std::fprintf(stderr, "  %s\n", detail);
    return 1;
  }

  const int server = ::socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) {
    std::perror("socket");
    return 1;
  }
  int yes = 1;
  ::setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
  sockaddr_in addr;
  std::memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  if (::bind(server, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    std::perror("bind");
    return 1;
  }
  if (::listen(server, 16) != 0) {
    std::perror("listen");
    return 1;
  }
  std::fprintf(stderr, "hedgehog getmoves on :%d model %s (ply max 1)\n", port, model.c_str());

  for (;;) {
    const int fd = ::accept(server, nullptr, nullptr);
    if (fd < 0) continue;
    handle(fd, ctx, model);
    ::close(fd);
  }
}
