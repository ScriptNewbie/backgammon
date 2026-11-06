// Prints the CUDA devices the container can see. `docker compose --profile gpu-info run --rm gpu-info`.
#include <cstdio>
#include <cuda_runtime.h>

__global__ void addOne(int* v) { *v += 1; }

int main() {
  int count = 0;
  cudaError_t err = cudaGetDeviceCount(&count);
  if (err != cudaSuccess) {
    std::printf("cudaGetDeviceCount failed: %s\n", cudaGetErrorString(err));
    return 1;
  }
  int driver = 0, runtime = 0;
  cudaDriverGetVersion(&driver);
  cudaRuntimeGetVersion(&runtime);
  std::printf("CUDA driver %d.%d, runtime %d.%d, devices %d\n", driver / 1000, (driver % 1000) / 10,
              runtime / 1000, (runtime % 1000) / 10, count);
  for (int i = 0; i < count; i++) {
    cudaDeviceProp p{};
    cudaGetDeviceProperties(&p, i);
    std::printf("  [%d] %s  sm_%d%d  %d SMs  %.1f GiB  L2 %d MiB\n", i, p.name, p.major, p.minor,
                p.multiProcessorCount, p.totalGlobalMem / 1073741824.0, p.l2CacheSize >> 20);
  }
  if (count == 0) return 1;
  // Prove a kernel compiled for this arch actually runs.
  int* d = nullptr;
  int h = 41;
  cudaMalloc(&d, sizeof(int));
  cudaMemcpy(d, &h, sizeof(int), cudaMemcpyHostToDevice);
  addOne<<<1, 1>>>(d);
  err = cudaGetLastError();
  cudaMemcpy(&h, d, sizeof(int), cudaMemcpyDeviceToHost);
  cudaFree(d);
  if (err != cudaSuccess || h != 42) {
    std::printf("kernel launch failed: %s (value %d)\n", cudaGetErrorString(err), h);
    return 1;
  }
  std::printf("kernel ok\n");
  return 0;
}
