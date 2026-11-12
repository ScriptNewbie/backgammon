// The HTTP layer: real routes on a local port, with a fake net.
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <thread>

#include <doctest/doctest.h>
#include <httplib.h>

#include "features.hpp"
#include "helpers.hpp"
#include "http.hpp"

using namespace bgtest;

namespace {

struct ConstNet : bg::Net {
  void infer(const float* in, int n, float* out) override {
    for (int r = 0; r < n; r++) {
      const float* x = in + static_cast<size_t>(r) * bg::kFeatureSize;
      float* o = out + static_cast<size_t>(r) * 5;
      o[0] = 0.4f + 0.01f * x[0];  // a little variation so sorting has something to do
      o[1] = 0.1f;
      o[2] = 0.01f;
      o[3] = 0.12f;
      o[4] = 0.01f;
    }
  }
};

struct ThrowingNet : bg::Net {
  void infer(const float*, int, float*) override { throw std::logic_error("gpu fell over"); }
};

// Serves the routes on 127.0.0.1:<free port> for the lifetime of the object.
class TestServer {
 public:
  explicit TestServer(bg::Net& net) {
    bg::registerRoutes(server_, net, /*log*/ false);
    port_ = server_.bind_to_any_port("127.0.0.1");
    REQUIRE(port_ > 0);
    thread_ = std::thread([this] { server_.listen_after_bind(); });
    server_.wait_until_ready();
  }
  ~TestServer() {
    server_.stop();
    thread_.join();
  }
  httplib::Client client() const { return httplib::Client("127.0.0.1", port_); }

 private:
  httplib::Server server_;
  std::thread thread_;
  int port_ = 0;
};

const Abs kOpening = pos({{1, -2}, {6, 5}, {8, 3}, {12, -5}, {13, 5}, {17, -3}, {19, -5}, {24, 2}}, 0, 0, 0, 0);

std::string openingBody() { return toJson(kOpening, "p1", 3, 1).dump(); }

nlohmann::json post(httplib::Client& c, const std::string& path, const std::string& body, int expectStatus) {
  auto res = c.Post(path, body, "application/json");
  REQUIRE(res);
  CHECK(res->status == expectStatus);
  CHECK(res->get_header_value("Content-Type") == "application/json");
  return nlohmann::json::parse(res->body);
}

}  // namespace

TEST_CASE("GET /health") {
  ConstNet net;
  TestServer server(net);
  auto c = server.client();
  auto res = c.Get("/health");
  REQUIRE(res);
  CHECK(res->status == 200);
  CHECK(nlohmann::json::parse(res->body) == nlohmann::json{{"ok", true}});
}

TEST_CASE("POST /evaluate: default ply 0 and ply 1 return the evaluate response") {
  ConstNet net;
  TestServer server(net);
  auto c = server.client();
  const auto ply0 = post(c, "/evaluate", openingBody(), 200);
  const auto ply1 = post(c, "/evaluate?ply=1", openingBody(), 200);
  REQUIRE(ply0["moves"].is_array());
  CHECK(ply0["moves"].size() == 16);  // distinct opening 3-1 plays
  CHECK(ply1["moves"].size() == ply0["moves"].size());
  const auto& eval = ply0["moves"][0]["eval"];
  CHECK(eval["source"] == "model");
  CHECK(eval["cubeAction"].is_null());
  CHECK(eval["cubeless"].contains("equity"));
  CHECK(post(c, "/evaluate?ply=0", openingBody(), 200) == ply0);
}

TEST_CASE("POST /evaluate: bad input is a 400 with a reason") {
  ConstNet net;
  TestServer server(net);
  auto c = server.client();
  for (const char* q : {"?ply=5", "?ply=x", "?ply=-1", "?ply=01", "?ply="}) {
    INFO(q);
    CHECK(post(c, std::string("/evaluate") + q, openingBody(), 400)["error"] == "ply must be an integer 0-4");
  }
  CHECK(post(c, "/evaluate", "{not json", 400)["error"] == "invalid json");
  nlohmann::json noDice = toJson(kOpening, "p1", 3, 1);
  noDice["dice"] = nullptr;
  CHECK(post(c, "/evaluate", noDice.dump(), 400)["error"] == "dice must be two ints 1-6");
}

TEST_CASE("POST /evaluate: a search over the leaf budget is a 400, and the server keeps serving") {
  ConstNet net;
  TestServer server(net);
  auto c = server.client();
  ::setenv("SEARCH_MAX_LEAF_VISITS", "100", 1);
  const auto rejected = post(c, "/evaluate?ply=2", openingBody(), 400);
  ::unsetenv("SEARCH_MAX_LEAF_VISITS");
  CHECK(rejected["error"].get<std::string>().find("search too large") == 0);
  CHECK(rejected["error"].get<std::string>().find("use a lower ply") != std::string::npos);
  CHECK(post(c, "/evaluate?ply=2", openingBody(), 200)["moves"].size() >= 1);
}

TEST_CASE("POST /evaluate: an internal failure is a 500 with a reason") {
  ThrowingNet net;
  TestServer server(net);
  auto c = server.client();
  const auto res = post(c, "/evaluate", openingBody(), 500);
  CHECK(res["error"] == "internal error: gpu fell over");
}

TEST_CASE("POST /cube: the doubler on roll without dice; ply and dice are checked") {
  ConstNet net;
  TestServer server(net);
  auto c = server.client();
  nlohmann::json body = toJson(kOpening, "p1", 3, 1);
  body["dice"] = nullptr;
  body["match"] = {{"length", 7}, {"score", {{"p1", 0}, {"p2", 0}}}, {"crawford", false}};
  const auto ply0 = post(c, "/cube", body.dump(), 200);
  CHECK(ply0["available"] == true);
  CHECK((ply0["offer"] == "double" || ply0["offer"] == "no-double"));
  CHECK((ply0["take"] == "take" || ply0["take"] == "drop"));
  CHECK(ply0["noDouble"].is_number());
  CHECK(ply0["cubeless"].contains("equity"));
  CHECK(post(c, "/cube?ply=1", body.dump(), 200)["available"] == true);
  CHECK(post(c, "/cube?ply=5", body.dump(), 400)["error"] == "ply must be an integer 0-4");
  body["match"] = nullptr;
  CHECK(post(c, "/cube", body.dump(), 200)["available"] == false);
  CHECK(post(c, "/cube", openingBody(), 400)["error"] == "dice must be null (cube decisions are made before the roll)");
  CHECK(post(c, "/cube", "{not json", 400)["error"] == "invalid json");
}
