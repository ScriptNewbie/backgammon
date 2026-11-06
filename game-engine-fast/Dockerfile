FROM nvidia/cuda:13.0.2-devel-ubuntu24.04

# CUDA 13 + nvcc + cuBLAS come from the base image (ADR 0028). Build tools only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends cmake ninja-build git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo/game-engine-fast

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["game-engine-fast"]
