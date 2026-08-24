# move-dumper

TypeScript tool. Simulates money games (no cube) between skill levels and dumps labelled checker positions from [foochu/bgweb-api](https://github.com/foochu/bgweb-api) ([ADR 0020](../../docs/decisions/0020-dumper-games-no-cube.md)).

- Loop, pairing, levels: `docs/domain/move-dumper.md`. Game loop from `ts-core/sim` `playGame({ allowCube: false })`. Board helpers come from `ts-core`. Do not import `ts-core/match` (MET / MWC / cube wrap are arena and engine only).
- Convert at the boundary per `docs/domain/gnubg.md`. Store our JSON + evals only. Rank chosen checker plays by negated result cubeless equity (`RankedPlay.rankScore`, not `moverMwc`). Loop lives in `src/games.ts`.
- On-disk batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`). Manifest `play` is `"game"`. `matchId` equals `gameId`.
- Do not call the gnubg CLI for labels. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.
- Docker only, from `move-dumper/`: `npm run up` (teacher), `npm test`, `npm run dump -- --games 1 --seed 1`, `npm run down`. `npm run install:host` writes `node_modules` on the host for IDE typechecking; do not run dumps or tests from that tree. Do not run `dump:inner` / `test:inner` on the host.
