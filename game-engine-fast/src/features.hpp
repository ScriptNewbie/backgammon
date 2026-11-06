#pragma once
// Board → length-206 float32 STM vector (docs/domain/features.md). Cube block fixed (ADR 0029).
#include "board.hpp"

namespace bg {

constexpr int kFeatureSize = 206;

BG_HD inline void encodeCount(int n, float* out) {
  out[0] = n >= 1 ? 1.0f : 0.0f;
  out[1] = n >= 2 ? 1.0f : 0.0f;
  out[2] = n >= 3 ? 1.0f : 0.0f;
  out[3] = n > 3 ? static_cast<float>(n - 3) / 2.0f : 0.0f;
}

BG_HD inline void featurize(const Board& b, float* out) {
  for (int k = 0; k < 24; k++) {
    // Tensor point k is STM's point k + 1; the opponent's checkers there are on its point 24 - k.
    encodeCount(b.me[k + 1], out + k * 4);
    encodeCount(b.opp[24 - k], out + 96 + k * 4);
  }
  out[192] = static_cast<float>(b.me[kBar]) / 2.0f;
  out[193] = static_cast<float>(b.opp[kBar]) / 2.0f;
  out[194] = static_cast<float>(b.me[kOff]) / 15.0f;
  out[195] = static_cast<float>(b.opp[kOff]) / 15.0f;
  for (int i = 196; i < kFeatureSize; i++) out[i] = 0.0f;
  out[197] = 1.0f;  // dead cube: centered
}

}  // namespace bg
