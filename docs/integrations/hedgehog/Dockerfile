# Local sidecar only. Not part of this repo's Compose workflow.
# The engine source it clones is MIT. The .ogxf weight file is not, and this
# image must not be published.
#
#   docker build -t hedgehog-getmoves docs/integrations/hedgehog
#   docker run --rm -p 8090:8090 hedgehog-getmoves
#
# Fastest public net instead of the strongest:
#   docker build --build-arg MODEL=fox_v0.34_2026-09-26.ogxf -t hedgehog-getmoves docs/integrations/hedgehog

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ make ca-certificates git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 https://gitlab.com/eranlambooij/hedgehog-public.git .

COPY getmoves_server.cpp /src/examples/getmoves_server.cpp

ARG MODEL=aureus_v0.12_2026-09-26.ogxf
ENV HEDGEHOG_MODEL_FILE=/opt/${MODEL}
RUN make NATIVE=0 example \
    && g++ -O3 -Wall -Wextra -std=c++17 -I. -Isrc -Ilib -Ihwy \
        -o build/getmoves_server examples/getmoves_server.cpp \
        $(find obj -maxdepth 1 -name '*.o') -lm -lpthread \
    && curl -fsSL -o "$HEDGEHOG_MODEL_FILE" "https://hedgehog-bg.com/models/${MODEL}"

EXPOSE 8090
ENTRYPOINT ["/bin/sh", "-c", "exec /src/build/getmoves_server \"$HEDGEHOG_MODEL_FILE\" \"${PORT:-8090}\""]
