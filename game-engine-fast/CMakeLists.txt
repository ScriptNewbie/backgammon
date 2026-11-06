cmake_minimum_required(VERSION 3.28)
project(game_engine_fast LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 20)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)
# RTX 50xx (Blackwell, sm_120). Override with -DCMAKE_CUDA_ARCHITECTURES=... for other cards.
if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
  set(CMAKE_CUDA_ARCHITECTURES 120)
endif()
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(CUDAToolkit REQUIRED)

include(FetchContent)
set(FETCHCONTENT_QUIET ON)
FetchContent_Declare(nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz)
FetchContent_Declare(httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.18.3
  GIT_SHALLOW TRUE)
FetchContent_Declare(doctest
  GIT_REPOSITORY https://github.com/doctest/doctest.git
  GIT_TAG v2.4.11
  GIT_SHALLOW TRUE)
set(HTTPLIB_USE_OPENSSL_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_ZLIB_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
set(HTTPLIB_USE_BROTLI_IF_AVAILABLE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(nlohmann_json httplib doctest)

# Rules, featurizer, JSON, ONNX reader, CPU net, evaluate. No CUDA here.
add_library(bgcore STATIC
  src/movegen.cpp
  src/position_json.cpp
  src/onnx_mlp.cpp
  src/evaluate.cpp)
target_include_directories(bgcore PUBLIC src)
target_link_libraries(bgcore PUBLIC nlohmann_json::nlohmann_json)
target_compile_options(bgcore PRIVATE -Wall -Wextra)

# GPU forward pass (cuBLAS, FP32).
add_library(bggpu STATIC src/net_gpu.cu)
target_link_libraries(bggpu PUBLIC bgcore CUDA::cudart CUDA::cublas)

add_executable(game-engine-fast src/server.cpp)
target_link_libraries(game-engine-fast PRIVATE bggpu httplib::httplib)

add_executable(gpu-info src/gpu_info.cu)
target_link_libraries(gpu-info PRIVATE CUDA::cudart)

add_executable(game-engine-fast-tests
  test/main.cpp
  test/board_test.cpp
  test/movegen_test.cpp
  test/features_test.cpp
  test/evaluate_test.cpp
  test/net_test.cpp)
target_link_libraries(game-engine-fast-tests PRIVATE bggpu doctest::doctest)
