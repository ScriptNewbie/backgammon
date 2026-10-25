# 0022 Hedgehog stays outside the repo

- Status: accepted
- Date: 2026-10-25

## Context

We want to score our engine against Hedgehog ([hedgehog-bg.com](https://hedgehog-bg.com/)) at the strongest setting the public engine allows. This repository stays MIT. GNU Backgammon remains the training teacher: `foochu/bgweb-api` in Compose, not the gnubg sources ([ADR 0006](0006-teacher-bgweb-api.md)).

The evaluation library at [gitlab.com/eranlambooij/hedgehog-public](https://gitlab.com/eranlambooij/hedgehog-public) is MIT. It does not ship weights, and it has no HTTP server and no published image. The site's WASM build and the `.ogxf` networks are licensed for non-commercial use, separate from that MIT code. Colossus, the strongest net on their benchmark page, is not in the public model directory. Aureus (`aureus_v0.12_2026-09-26.ogxf`) is the strongest file that directory serves, and the public search stops at what that project calls 2-ply. This repository names that depth GnuBG 1-ply: `ply` 0 is the net and `ply` 1 is one roll.

## Decision

- Do not vendor the engine or any `.ogxf` into this repo. Do not add a Compose service that downloads the weights.
- Talk to a sidecar the user builds from `docs/integrations/hedgehog/` (`GET /health`, `POST /v1/moves`). The client is `ts-core/hedgehog`. OGID is a boundary encoding, not a stored representation.
- Arena only: `--opponent hedgehog` (default remains `teacher` / bgweb-api). Checker rank stays mover MWC. Cube stays the shared infallible heuristic. `source` on those in-memory evals is `"hedgehog"`.
- Do not label training dumps from Hedgehog. `move-dumper` stays on bgweb-api.

## Consequences

bgweb-api dumps and battles are unchanged when hedgehog is not one of the sides. Rebuilding the sidecar is required when hedgehog-public changes the load or search API. Do not commit model files or the sidecar image.

[0023](0023-arena-any-driver.md) replaces `--opponent hedgehog` with `--a` / `--b`. Hedgehog is still an external sidecar and still not a dump source. `ply` is set per side (`--a-ply`, `--b-ply`).
