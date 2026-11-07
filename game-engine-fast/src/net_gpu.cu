#include "net_gpu.hpp"

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <stdexcept>
#include <string>
#include <vector>

#include <cublas_v2.h>
#include <cuda_runtime.h>

#include "features.hpp"

namespace bg {
namespace {

constexpr int kDefaultSubBatch = 16384;
constexpr int kDefaultLanes = 2;

void check(cudaError_t err, const char* what) {
  if (err != cudaSuccess) throw std::runtime_error(std::string(what) + ": " + cudaGetErrorString(err));
}

void check(cublasStatus_t st, const char* what) {
  if (st != CUBLAS_STATUS_SUCCESS) {
    throw std::runtime_error(std::string(what) + ": cuBLAS status " + std::to_string(static_cast<int>(st)));
  }
}

int envInt(const char* name, int fallback) {
  const char* v = std::getenv(name);
  const int n = v ? std::atoi(v) : 0;
  return n > 0 ? n : fallback;
}

// One thread per board: STM board → 206 features, row-major [n, 206]. Same code as the CPU.
__global__ void featurizeBoards(const Board* boards, int n, float* features) {
  const int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  featurize(boards[i], features + static_cast<size_t>(i) * kFeatureSize);
}

// y is row-major [n, out]: add bias, then ReLU or sigmoid.
__global__ void biasActivation(float* y, const float* bias, int n, int out, bool relu) {
  const int idx = blockIdx.x * blockDim.x + threadIdx.x;
  if (idx >= n * out) return;
  const float v = y[idx] + bias[idx % out];
  y[idx] = relu ? fmaxf(v, 0.0f) : 1.0f / (1.0f + expf(-v));
}

struct DeviceLayer {
  int in;
  int out;
  bool relu;
  float* weight;  // row-major [out, in]
  float* bias;
};

// Everything one in-flight sub-batch needs.
struct Lane {
  cudaStream_t stream = nullptr;
  cublasHandle_t handle = nullptr;
  float* bufA = nullptr;    // [subBatch, maxWidth]
  float* bufB = nullptr;
  Board* boards = nullptr;  // device, [subBatch]
  Board* pinIn = nullptr;   // pinned host staging for boards
  float* pinOut = nullptr;  // pinned host staging for results
  int pendingRows = 0;      // rows enqueued but not yet copied to the caller
  float* pendingDst = nullptr;

  void release() {
    cudaFree(bufA);
    cudaFree(bufB);
    cudaFree(boards);
    cudaFreeHost(pinIn);
    cudaFreeHost(pinOut);
    if (handle) cublasDestroy(handle);
    if (stream) cudaStreamDestroy(stream);
  }
};

}  // namespace

struct GpuNet::Impl {
  std::vector<DeviceLayer> layers;
  std::vector<Lane> lanes;
  int maxWidth = 0;
  int sub = 0;

  ~Impl() {
    cudaDeviceSynchronize();
    for (DeviceLayer& L : layers) {
      cudaFree(L.weight);
      cudaFree(L.bias);
    }
    for (Lane& l : lanes) l.release();
  }

  int outSize() const { return layers.back().out; }

  // Enqueue the layers on the lane's stream for `rows` rows already in bufA, then the copy of the
  // results into pinned staging.
  void forward(Lane& l, int rows) {
    const float one = 1.0f, zero = 0.0f;
    float* x = l.bufA;
    float* y = l.bufB;
    for (const DeviceLayer& L : layers) {
      // Row-major Y[n,out] = X[n,in] · W[out,in]^T. cuBLAS is column-major, so compute
      // Y^T[out,n] = W · X^T: W (row-major [out,in]) is column-major [in,out] → transpose it.
      check(cublasSgemm(l.handle, CUBLAS_OP_T, CUBLAS_OP_N, L.out, rows, L.in, &one, L.weight, L.in, x, L.in,
                        &zero, y, L.out),
            "cublasSgemm");
      const int total = rows * L.out;
      biasActivation<<<(total + 255) / 256, 256, 0, l.stream>>>(y, L.bias, rows, L.out, L.relu);
      check(cudaGetLastError(), "biasActivation");
      std::swap(x, y);
    }
    check(cudaMemcpyAsync(l.pinOut, x, sizeof(float) * static_cast<size_t>(rows) * outSize(),
                          cudaMemcpyDeviceToHost, l.stream),
          "copy output");
  }

  // Wait for the lane's pending sub-batch and hand its results to the caller.
  void collect(Lane& l) {
    if (l.pendingRows == 0) return;
    const int rows = l.pendingRows;
    l.pendingRows = 0;
    check(cudaStreamSynchronize(l.stream), "stream sync");
    std::memcpy(l.pendingDst, l.pinOut, sizeof(float) * static_cast<size_t>(rows) * outSize());
  }

  // Run n rows in sub-batches over the lanes. `stage(lane, offset, rows)` enqueues the load of
  // rows [offset, offset + rows) into lane.bufA on lane.stream.
  void run(int n, float* out, const std::function<void(Lane&, int, int)>& stage) {
    try {
      for (int off = 0, k = 0; off < n; off += sub, k++) {
        Lane& l = lanes[k % lanes.size()];
        collect(l);  // the lane's staging buffers are free once its previous work is done
        const int rows = std::min(sub, n - off);
        stage(l, off, rows);
        forward(l, rows);
        l.pendingRows = rows;
        l.pendingDst = out + static_cast<size_t>(off) * outSize();
      }
      for (Lane& l : lanes) collect(l);
    } catch (...) {
      cudaDeviceSynchronize();
      for (Lane& l : lanes) l.pendingRows = 0;
      throw;
    }
  }
};

GpuNet::GpuNet(const Mlp& mlp, int subBatch, int lanes) : impl_(std::make_unique<Impl>()) {
  Impl& m = *impl_;
  m.sub = subBatch > 0 ? subBatch : envInt("GPU_SUBBATCH", kDefaultSubBatch);
  const int laneCount = lanes > 0 ? lanes : envInt("GPU_LANES", kDefaultLanes);
  m.maxWidth = mlp.inputSize();
  for (const DenseLayer& L : mlp.layers) {
    DeviceLayer d{L.in, L.out, L.relu, nullptr, nullptr};
    check(cudaMalloc(&d.weight, sizeof(float) * L.weight.size()), "cudaMalloc weight");
    check(cudaMalloc(&d.bias, sizeof(float) * L.bias.size()), "cudaMalloc bias");
    check(cudaMemcpy(d.weight, L.weight.data(), sizeof(float) * L.weight.size(), cudaMemcpyHostToDevice),
          "copy weight");
    check(cudaMemcpy(d.bias, L.bias.data(), sizeof(float) * L.bias.size(), cudaMemcpyHostToDevice),
          "copy bias");
    m.layers.push_back(d);
    m.maxWidth = std::max(m.maxWidth, L.out);
  }
  m.lanes.resize(laneCount);
  for (Lane& l : m.lanes) {
    check(cudaStreamCreateWithFlags(&l.stream, cudaStreamNonBlocking), "cudaStreamCreate");
    check(cublasCreate(&l.handle), "cublasCreate");
    check(cublasSetStream(l.handle, l.stream), "cublasSetStream");
    // Plain FP32: no TF32 tensor-op rounding (ADR 0028).
    check(cublasSetMathMode(l.handle, CUBLAS_PEDANTIC_MATH), "cublasSetMathMode");
    const size_t act = sizeof(float) * static_cast<size_t>(m.sub) * m.maxWidth;
    check(cudaMalloc(&l.bufA, act), "cudaMalloc activations");
    check(cudaMalloc(&l.bufB, act), "cudaMalloc activations");
    check(cudaMalloc(&l.boards, sizeof(Board) * static_cast<size_t>(m.sub)), "cudaMalloc boards");
    check(cudaMallocHost(&l.pinIn, sizeof(Board) * static_cast<size_t>(m.sub)), "cudaMallocHost");
    check(cudaMallocHost(&l.pinOut, sizeof(float) * static_cast<size_t>(m.sub) * m.outSize()), "cudaMallocHost");
  }
}

GpuNet::~GpuNet() = default;

int GpuNet::subBatch() const { return impl_->sub; }
int GpuNet::lanes() const { return static_cast<int>(impl_->lanes.size()); }

void GpuNet::infer(const float* in, int n, float* out) {
  if (n <= 0) return;
  std::lock_guard<std::mutex> lock(mutex_);
  Impl& m = *impl_;
  const int inSize = m.layers.front().in;
  m.run(n, out, [&](Lane& l, int off, int rows) {
    // Pageable source: the driver stages it, so `in` is free to reuse when this returns.
    check(cudaMemcpyAsync(l.bufA, in + static_cast<size_t>(off) * inSize,
                          sizeof(float) * static_cast<size_t>(rows) * inSize, cudaMemcpyHostToDevice, l.stream),
          "copy input");
  });
}

void GpuNet::inferBoards(const Board* boards, int n, float* out) {
  if (n <= 0) return;
  std::lock_guard<std::mutex> lock(mutex_);
  Impl& m = *impl_;
  if (m.layers.front().in != kFeatureSize) throw std::runtime_error("net input is not the 206-float tensor");
  m.run(n, out, [&](Lane& l, int off, int rows) {
    // 52 bytes per board over PCIe instead of 824 bytes of features.
    std::memcpy(l.pinIn, boards + off, sizeof(Board) * static_cast<size_t>(rows));
    check(cudaMemcpyAsync(l.boards, l.pinIn, sizeof(Board) * static_cast<size_t>(rows), cudaMemcpyHostToDevice,
                          l.stream),
          "copy boards");
    featurizeBoards<<<(rows + 255) / 256, 256, 0, l.stream>>>(l.boards, rows, l.bufA);
    check(cudaGetLastError(), "featurizeBoards");
  });
}

bool cudaAvailable() {
  int count = 0;
  return cudaGetDeviceCount(&count) == cudaSuccess && count > 0;
}

}  // namespace bg
