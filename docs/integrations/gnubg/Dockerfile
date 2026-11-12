# GNU Backgammon sidecar (docs/domain/gnubg.md, ADR 0031). Built by the move-dumper and
# battle-arena Compose files.
#
# GNU Backgammon is GPL-3.0-or-later. It is installed here from Debian at build time and
# is never copied into this repo. server.mjs is ours: it runs the gnubg binary as a
# separate process and speaks only its text command line over pipes, so no GPL code is
# linked into or vendored by this repo. Build locally; do not publish the image.

FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gnubg coreutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY server.mjs ./server.mjs

ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "/srv/server.mjs"]
