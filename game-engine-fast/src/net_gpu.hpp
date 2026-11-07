#pragma once
#include <memory>
#include <mutex>

#include "onnx_mlp.hpp"

namespace bg {

// FP32 forward pass on the GPU: one cuBLAS SGEMM per layer + a fused bias/activation kernel.
// Thread-safe (one request at a time); buffers grow to the largest batch seen.
class GpuNet : public Net {
 public:
  explicit GpuNet(const Mlp& mlp);
  ~GpuNet() override;
  GpuNet(const GpuNet&) = delete;
  GpuNet& operator=(const GpuNet&) = delete;

  void infer(const float* in, int n, float* out) override;
  void inferBoards(const Board* boards, int n, float* out) override;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
  std::mutex mutex_;
};

// True if at least one CUDA device is usable.
bool cudaAvailable();

}  // namespace bg
