#!/bin/bash
# Configure + incremental build into the /build volume (Linux binaries never land on the host),
# then run the requested binary from /build.
set -euo pipefail
cd /repo/game-engine-fast
cmake -S . -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build /build
export PATH="/build:${PATH}"
exec "$@"
