#include "onnx_mlp.hpp"

#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>

namespace bg {
namespace {

[[noreturn]] void fail(const std::string& message) {
  throw std::runtime_error("onnx: " + message);
}

// Minimal protobuf wire-format reader: just enough of ModelProto / GraphProto / NodeProto /
// TensorProto / AttributeProto to read our graph. Unknown fields are skipped.
struct Reader {
  const uint8_t* p;
  const uint8_t* end;

  bool done() const { return p >= end; }

  uint64_t varint() {
    uint64_t v = 0;
    for (int shift = 0; shift < 64; shift += 7) {
      if (p >= end) fail("truncated varint");
      const uint8_t byte = *p++;
      v |= static_cast<uint64_t>(byte & 0x7f) << shift;
      if ((byte & 0x80) == 0) return v;
    }
    fail("varint too long");
  }

  Reader bytes() {
    const uint64_t n = varint();
    if (n > static_cast<uint64_t>(end - p)) fail("truncated field");
    Reader sub{p, p + n};
    p += n;
    return sub;
  }

  std::string str() {
    Reader sub = bytes();
    return std::string(reinterpret_cast<const char*>(sub.p), sub.end - sub.p);
  }

  void skip(int wire) {
    switch (wire) {
      case 0: varint(); break;
      case 1: advance(8); break;
      case 2: bytes(); break;
      case 5: advance(4); break;
      default: fail("unsupported wire type " + std::to_string(wire));
    }
  }

  float f32() {
    float f;
    if (end - p < 4) fail("truncated float");
    std::memcpy(&f, p, 4);
    p += 4;
    return f;
  }

  void advance(int n) {
    if (end - p < n) fail("truncated field");
    p += n;
  }
};

struct Tensor {
  std::string name;
  std::vector<int64_t> dims;
  int dataType = 0;
  std::vector<float> data;
  bool external = false;
};

struct Attribute {
  std::string name;
  int64_t i = 0;
  float f = 0;
  bool hasI = false;
  bool hasF = false;
};

struct Node {
  std::string op;
  std::vector<std::string> inputs;
  std::vector<std::string> outputs;
  std::vector<Attribute> attributes;
};

struct Graph {
  std::vector<Node> nodes;
  std::map<std::string, Tensor> initializers;
  std::vector<std::string> inputs;
  std::vector<std::string> outputs;
};

Tensor readTensor(Reader r) {
  Tensor t;
  std::string raw;
  while (!r.done()) {
    const uint64_t key = r.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 1 && wire == 0) {
      t.dims.push_back(static_cast<int64_t>(r.varint()));
    } else if (field == 1 && wire == 2) {
      Reader packed = r.bytes();
      while (!packed.done()) t.dims.push_back(static_cast<int64_t>(packed.varint()));
    } else if (field == 2 && wire == 0) {
      t.dataType = static_cast<int>(r.varint());
    } else if (field == 4 && wire == 2) {
      Reader packed = r.bytes();
      while (!packed.done()) t.data.push_back(packed.f32());
    } else if (field == 8 && wire == 2) {
      t.name = r.str();
    } else if (field == 9 && wire == 2) {
      raw = r.str();
    } else if (field == 14 && wire == 0) {
      t.external = r.varint() == 1;
    } else {
      r.skip(wire);
    }
  }
  if (!raw.empty()) {
    if (raw.size() % 4 != 0) fail("raw_data of " + t.name + " is not float32");
    t.data.resize(raw.size() / 4);
    std::memcpy(t.data.data(), raw.data(), raw.size());  // little-endian, like x86 / CUDA
  }
  return t;
}

Attribute readAttribute(Reader r) {
  Attribute a;
  while (!r.done()) {
    const uint64_t key = r.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 1 && wire == 2) {
      a.name = r.str();
    } else if (field == 2 && wire == 5) {
      a.f = r.f32();
      a.hasF = true;
    } else if (field == 3 && wire == 0) {
      a.i = static_cast<int64_t>(r.varint());
      a.hasI = true;
    } else {
      r.skip(wire);
    }
  }
  return a;
}

Node readNode(Reader r) {
  Node n;
  while (!r.done()) {
    const uint64_t key = r.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 1 && wire == 2) {
      n.inputs.push_back(r.str());
    } else if (field == 2 && wire == 2) {
      n.outputs.push_back(r.str());
    } else if (field == 4 && wire == 2) {
      n.op = r.str();
    } else if (field == 5 && wire == 2) {
      n.attributes.push_back(readAttribute(r.bytes()));
    } else {
      r.skip(wire);
    }
  }
  return n;
}

// ValueInfoProto: we only need the name (field 1).
std::string readValueInfoName(Reader r) {
  std::string name;
  while (!r.done()) {
    const uint64_t key = r.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 1 && wire == 2) {
      name = r.str();
    } else {
      r.skip(wire);
    }
  }
  return name;
}

Graph readGraph(Reader r) {
  Graph g;
  while (!r.done()) {
    const uint64_t key = r.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 1 && wire == 2) {
      g.nodes.push_back(readNode(r.bytes()));
    } else if (field == 5 && wire == 2) {
      Tensor t = readTensor(r.bytes());
      g.initializers[t.name] = std::move(t);
    } else if (field == 11 && wire == 2) {
      g.inputs.push_back(readValueInfoName(r.bytes()));
    } else if (field == 12 && wire == 2) {
      g.outputs.push_back(readValueInfoName(r.bytes()));
    } else {
      r.skip(wire);
    }
  }
  return g;
}

const Tensor& floatInitializer(const Graph& g, const std::string& name) {
  auto it = g.initializers.find(name);
  if (it == g.initializers.end()) fail("missing initializer " + name);
  const Tensor& t = it->second;
  if (t.external) fail(name + " uses external data");
  if (t.dataType != 1) fail(name + " is not float32");
  return t;
}

void checkGemm(const Node& n) {
  for (const Attribute& a : n.attributes) {
    const bool ok = (a.name == "transB" && a.i == 1) || (a.name == "transA" && a.i == 0) ||
                    (a.name == "alpha" && a.f == 1.0f) || (a.name == "beta" && a.f == 1.0f);
    if (!ok) fail("unsupported Gemm attribute " + a.name);
  }
  bool transB = false;
  for (const Attribute& a : n.attributes) transB = transB || (a.name == "transB" && a.i == 1);
  if (!transB) fail("Gemm must have transB=1");
  if (n.inputs.size() != 3 || n.outputs.size() != 1) fail("Gemm must have 3 inputs, 1 output");
}

}  // namespace

Mlp parseOnnxMlp(const std::string& bytes) {
  Reader model{reinterpret_cast<const uint8_t*>(bytes.data()),
               reinterpret_cast<const uint8_t*>(bytes.data()) + bytes.size()};
  Graph g;
  bool haveGraph = false;
  while (!model.done()) {
    const uint64_t key = model.varint();
    const int field = static_cast<int>(key >> 3), wire = static_cast<int>(key & 7);
    if (field == 7 && wire == 2) {
      g = readGraph(model.bytes());
      haveGraph = true;
    } else {
      model.skip(wire);
    }
  }
  if (!haveGraph) fail("no graph");

  // Graph inputs may also list initializers (older exporters); keep only real inputs.
  std::vector<std::string> inputs;
  for (const std::string& name : g.inputs) {
    if (!g.initializers.count(name)) inputs.push_back(name);
  }
  if (inputs.size() != 1 || inputs[0] != "features") fail("expected one input named features");
  if (g.outputs.size() != 1 || g.outputs[0] != "cubeless") fail("expected one output named cubeless");

  Mlp mlp;
  std::string current = "features";
  size_t i = 0;
  while (i < g.nodes.size()) {
    const Node& gemm = g.nodes[i];
    if (gemm.op != "Gemm") fail("expected Gemm, got " + gemm.op);
    checkGemm(gemm);
    if (gemm.inputs[0] != current) fail("Gemm input is not the previous output");
    const Tensor& w = floatInitializer(g, gemm.inputs[1]);
    const Tensor& b = floatInitializer(g, gemm.inputs[2]);
    if (w.dims.size() != 2 || b.dims.size() != 1 || b.dims[0] != w.dims[0]) {
      fail("bad weight/bias shapes for " + gemm.inputs[1]);
    }
    DenseLayer layer;
    layer.out = static_cast<int>(w.dims[0]);
    layer.in = static_cast<int>(w.dims[1]);
    if (!mlp.layers.empty() && layer.in != mlp.layers.back().out) fail("layer sizes do not chain");
    if (w.data.size() != static_cast<size_t>(layer.out) * layer.in ||
        b.data.size() != static_cast<size_t>(layer.out)) {
      fail("weight data size mismatch for " + gemm.inputs[1]);
    }
    layer.weight = w.data;
    layer.bias = b.data;
    if (++i >= g.nodes.size()) fail("graph ends after Gemm");
    const Node& act = g.nodes[i++];
    if (act.inputs.size() != 1 || act.outputs.size() != 1 || act.inputs[0] != gemm.outputs[0]) {
      fail("activation does not follow Gemm");
    }
    current = act.outputs[0];
    if (act.op == "Relu") {
      layer.relu = true;
      mlp.layers.push_back(std::move(layer));
    } else if (act.op == "Sigmoid") {
      mlp.layers.push_back(std::move(layer));
      if (i != g.nodes.size()) fail("nodes after the final Sigmoid");
      if (current != "cubeless") fail("final Sigmoid must output cubeless");
      break;
    } else {
      fail("unsupported activation " + act.op);
    }
  }
  if (mlp.layers.empty() || mlp.layers.back().relu) fail("graph must end with Gemm → Sigmoid");
  if (mlp.inputSize() != 206 || mlp.outputSize() != 5) {
    fail("expected [N, 206] → [N, 5], got " + std::to_string(mlp.inputSize()) + " → " +
         std::to_string(mlp.outputSize()));
  }
  return mlp;
}

Mlp loadOnnxMlp(const std::string& path) {
  std::ifstream f(path, std::ios::binary);
  if (!f) fail("cannot open " + path);
  std::stringstream ss;
  ss << f.rdbuf();
  return parseOnnxMlp(ss.str());
}

void CpuNet::infer(const float* in, int n, float* out) {
  std::vector<float> a, b;
  for (int row = 0; row < n; row++) {
    a.assign(in + static_cast<size_t>(row) * mlp_.inputSize(),
             in + static_cast<size_t>(row + 1) * mlp_.inputSize());
    for (const DenseLayer& L : mlp_.layers) {
      b.assign(L.out, 0.0f);
      for (int o = 0; o < L.out; o++) {
        float sum = L.bias[o];
        const float* w = L.weight.data() + static_cast<size_t>(o) * L.in;
        for (int k = 0; k < L.in; k++) sum += w[k] * a[k];
        b[o] = L.relu ? (sum > 0.0f ? sum : 0.0f) : 1.0f / (1.0f + std::exp(-sum));
      }
      a.swap(b);
    }
    std::memcpy(out + static_cast<size_t>(row) * mlp_.outputSize(), a.data(),
                sizeof(float) * mlp_.outputSize());
  }
}

}  // namespace bg
