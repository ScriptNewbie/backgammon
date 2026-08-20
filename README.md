# Backgammon

A backgammon engine split into three packages. None of them are implemented yet.

| Package | Role |
| --- | --- |
| `move-dumper` | TypeScript tool that simulates matches and dumps positions and move evaluations from [bgweb-api](https://github.com/foochu/bgweb-api) (GNU Backgammon nets over HTTP) |
| `training-ground` | PyTorch training; exports ONNX |
| `game-engine` | TypeScript HTTP API: board + dice → legal moves with evaluations; infers the net via ONNX Runtime |

Money play includes a doubling cube. **v1 dumps are match play** (Crawford, sampled odd match lengths). Players are `p1` / `p2`. Agent instructions: [AGENTS.md](AGENTS.md) and `docs/`. Cursor and Grok Build both use that file; Grok-native copies live under `.grok/`. In a Grok terminal: `grok` then `grok inspect`.
