#pragma once
#include <memory>
#include <mutex>

#include "onnx_mlp.hpp"

namespace bg {

// FP32 forward pass on the GPU: one cuBLAS SGEMM per layer + a bias/activation kernel.
//
// A call is split into sub-batches that rotate over `lanes` CUDA streams. Each lane has its own
// cuBLAS handle, device buffers, and pinned host staging, so the copy of one sub-batch overlaps
// the compute of another. Results do not depend on the lane count; they may differ in the last
// bits between sub-batch sizes (cuBLAS picks kernels by shape).
//
// Thread-safe (one call at a time). `subBatch` / `lanes` of 0 mean: GPU_SUBBATCH / GPU_LANES from
// the environment, else the defaults in net_gpu.cu.
class GpuNet : public Net {
 public:
  explicit GpuNet(const Mlp& mlp, int subBatch = 0, int lanes = 0);
  ~GpuNet() override;
  GpuNet(const GpuNet&) = delete;
  GpuNet& operator=(const GpuNet&) = delete;

  void infer(const float* in, int n, float* out) override;
  void inferBoards(const Board* boards, int n, float* out) override;

  int subBatch() const;
  int lanes() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
  std::mutex mutex_;
};

// True if at least one CUDA device is usable.
bool cudaAvailable();

}  // namespace bg
