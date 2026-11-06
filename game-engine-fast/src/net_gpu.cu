#include "net_gpu.hpp"

#include <stdexcept>
#include <string>
#include <vector>

#include <cublas_v2.h>
#include <cuda_runtime.h>

namespace bg {
namespace {

void check(cudaError_t err, const char* what) {
  if (err != cudaSuccess) throw std::runtime_error(std::string(what) + ": " + cudaGetErrorString(err));
}

void check(cublasStatus_t st, const char* what) {
  if (st != CUBLAS_STATUS_SUCCESS) {
    throw std::runtime_error(std::string(what) + ": cuBLAS status " + std::to_string(static_cast<int>(st)));
  }
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

}  // namespace

struct GpuNet::Impl {
  cublasHandle_t handle = nullptr;
  std::vector<DeviceLayer> layers;
  int maxWidth = 0;
  int capacity = 0;  // rows the activation buffers can hold
  float* bufA = nullptr;
  float* bufB = nullptr;

  ~Impl() {
    for (DeviceLayer& L : layers) {
      cudaFree(L.weight);
      cudaFree(L.bias);
    }
    cudaFree(bufA);
    cudaFree(bufB);
    if (handle) cublasDestroy(handle);
  }

  void reserve(int n) {
    if (n <= capacity) return;
    cudaFree(bufA);
    cudaFree(bufB);
    bufA = bufB = nullptr;
    const size_t bytes = sizeof(float) * static_cast<size_t>(n) * maxWidth;
    check(cudaMalloc(&bufA, bytes), "cudaMalloc activations");
    check(cudaMalloc(&bufB, bytes), "cudaMalloc activations");
    capacity = n;
  }
};

GpuNet::GpuNet(const Mlp& mlp) : impl_(std::make_unique<Impl>()) {
  check(cublasCreate(&impl_->handle), "cublasCreate");
  // Plain FP32: no TF32 tensor-op rounding (ADR 0028).
  check(cublasSetMathMode(impl_->handle, CUBLAS_PEDANTIC_MATH), "cublasSetMathMode");
  impl_->maxWidth = mlp.inputSize();
  for (const DenseLayer& L : mlp.layers) {
    DeviceLayer d{L.in, L.out, L.relu, nullptr, nullptr};
    check(cudaMalloc(&d.weight, sizeof(float) * L.weight.size()), "cudaMalloc weight");
    check(cudaMalloc(&d.bias, sizeof(float) * L.bias.size()), "cudaMalloc bias");
    check(cudaMemcpy(d.weight, L.weight.data(), sizeof(float) * L.weight.size(), cudaMemcpyHostToDevice),
          "copy weight");
    check(cudaMemcpy(d.bias, L.bias.data(), sizeof(float) * L.bias.size(), cudaMemcpyHostToDevice),
          "copy bias");
    impl_->layers.push_back(d);
    if (L.out > impl_->maxWidth) impl_->maxWidth = L.out;
  }
}

GpuNet::~GpuNet() = default;

void GpuNet::infer(const float* in, int n, float* out) {
  if (n <= 0) return;
  std::lock_guard<std::mutex> lock(mutex_);
  Impl& m = *impl_;
  m.reserve(n);
  const int inSize = m.layers.front().in;
  const int outSize = m.layers.back().out;
  check(cudaMemcpy(m.bufA, in, sizeof(float) * static_cast<size_t>(n) * inSize, cudaMemcpyHostToDevice),
        "copy input");

  const float one = 1.0f, zero = 0.0f;
  float* x = m.bufA;
  float* y = m.bufB;
  for (const DeviceLayer& L : m.layers) {
    // Row-major Y[n,out] = X[n,in] · W[out,in]^T. cuBLAS is column-major, so compute
    // Y^T[out,n] = W · X^T: W (row-major [out,in]) is column-major [in,out] → transpose it.
    check(cublasSgemm(m.handle, CUBLAS_OP_T, CUBLAS_OP_N, L.out, n, L.in, &one, L.weight, L.in, x, L.in,
                      &zero, y, L.out),
          "cublasSgemm");
    const int total = n * L.out;
    biasActivation<<<(total + 255) / 256, 256>>>(y, L.bias, n, L.out, L.relu);
    check(cudaGetLastError(), "biasActivation");
    float* t = x;
    x = y;
    y = t;
  }
  check(cudaMemcpy(out, x, sizeof(float) * static_cast<size_t>(n) * outSize, cudaMemcpyDeviceToHost),
        "copy output");
}

bool cudaAvailable() {
  int count = 0;
  return cudaGetDeviceCount(&count) == cudaSuccess && count > 0;
}

}  // namespace bg
