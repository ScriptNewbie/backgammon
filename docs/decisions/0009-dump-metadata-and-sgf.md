# 0009 Dump metadata and GNU Backgammon SGF replay

- Status: accepted (`play` / cube rows updated by [0020](0020-dumper-games-no-cube.md))
- Date: 2026-08-20

## Context

ADR 0005 locked `manifest.json` + gzip JSONL for training. Simulated matches also need which play was chosen, who was playing, and a file that existing tools can replay. GNU Backgammon already opens Smart Game Format (`GM[6]`) match files. SGF is a game record, not a fourth board encoding ([ADR 0002](0002-board-representations.md)).

## Decision

- Keep record schema `"v": 1`. Add fields: `matchId`, `gameId`, `ply`, `decision` (`"checker"` | `"cube"`), `players`, `chosen`.
- Training files stay `manifest.json` + `records.jsonl.gz` under gitignored `move-dumper/dumps/<batch-id>/`.
- Debug replay: one **GNU Backgammon SGF** per match (`FF[4]`, `GM[6]`) at `replay/<matchId>.sgf` in the same batch. Open with gnubg (`load match`). Training **ignores** SGF.
- Tiny git-tracked examples live in `move-dumper/fixtures/` (including a stub `.sgf`). Never commit `dumps/`.
- Manifest `engine.settings.play` is `"match"`. Record `position.match.length` is per-match, not a batch constant.

## Consequences

Do not store SGF as a training representation or parse it in `training-ground`. Do not bump dump `v` for these additive fields. Trainers that only read `position` + `moves[].eval.cubeless` keep working if they skip `decision != "checker"`. [ADR 0020](0020-dumper-games-no-cube.md) sets manifest `play` to `"game"`, writes checker-only rows, and one SGF per `gameId`. Spec: [dump-format.md](../domain/dump-format.md).
