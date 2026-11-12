# move-dumper

TypeScript tool. Simulates money games (no cube) between skill levels and dumps checker positions labelled by GNU Backgammon through the `gnubg` CLI sidecar ([ADR 0020](../../docs/decisions/0020-dumper-games-no-cube.md), [ADR 0031](../../docs/decisions/0031-gnubg-cli-sidecar.md)).

- Loop, pairing, levels: `docs/domain/move-dumper.md`. Game loop from `ts-core/sim` `playGame({ allowCube: false })`. Board helpers come from `ts-core`. Do not import `ts-core/match` (MET / MWC / cube wrap are arena and engine only).
- Convert at the boundary per `docs/domain/gnubg.md`. Store our JSON + evals only. Rank chosen checker plays by negated result cubeless equity (`RankedPlay.rankScore`, not `moverMwc`). Loop lives in `src/games.ts`. Labels come from `ts-core/gnubg` (`--ply`, default 2; `--label-filter`, default `gnubg`). Do not label dumps from Hedgehog or XG.
- On-disk batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`). Manifest `play` is `"game"`. Records have `gameId`; do not write `matchId`.
- gnubg is GPL: reach it only through the sidecar (`docs/integrations/gnubg/`), never link, vendor, or script it from inside, and never publish the image. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.
- Docker only, from `move-dumper/`. Host commands: [README.md](../../README.md). `install-host` writes `node_modules` on the host for IDE typechecking; do not run dumps or tests from that tree. Do not run `dump:inner` / `test:inner` on the host.
