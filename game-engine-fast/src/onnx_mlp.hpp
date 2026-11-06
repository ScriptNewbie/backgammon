#pragma once
// Loads the cubeless MLP from cubeless-fast.onnx (ADR 0028) without ONNX Runtime.
// Accepts only the exported shape: Gemm(transB=1) → Relu → … → Gemm → Sigmoid,
// input `features` [N, 206], output `cubeless` [N, 5]. Anything else is rejected.
#include <string>
#include <vector>

namespace bg {

struct DenseLayer {
  int in = 0;
  int out = 0;
  std::vector<float> weight;  // row-major [out, in] (PyTorch Linear layout)
  std::vector<float> bias;    // [out]
  bool relu = false;          // ReLU after this layer; the last layer has a sigmoid instead
};

struct Mlp {
  std::vector<DenseLayer> layers;
  int inputSize() const { return layers.front().in; }
  int outputSize() const { return layers.back().out; }
};

Mlp loadOnnxMlp(const std::string& path);
Mlp parseOnnxMlp(const std::string& bytes);

// Batched inference: `in` is row-major [n, inputSize], `out` row-major [n, outputSize].
class Net {
 public:
  virtual ~Net() = default;
  virtual void infer(const float* in, int n, float* out) = 0;
};

// Reference implementation on the CPU (tests, and a fallback without a GPU).
class CpuNet : public Net {
 public:
  explicit CpuNet(Mlp mlp) : mlp_(std::move(mlp)) {}
  void infer(const float* in, int n, float* out) override;

 private:
  Mlp mlp_;
};

}  // namespace bg
