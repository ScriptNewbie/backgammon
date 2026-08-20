# replay-player

Vite + vanilla TypeScript. Debug viewer for GNU Backgammon SGF dumps ([ADR 0010](../../docs/decisions/0010-replay-player.md)).

- Input is `FF[4]` `GM[6]` match files from `move-dumper/dumps/<batch>/replay/`. File picker only. No JSONL, no backend, no React.
- Start with `docker compose up` in `replay-player/` (http://localhost:5173). Previous / Next is one checker step or cube action.
- Reconstruct position JSON by applying checker steps and cube double / take / drop from the standard opening (`docs/domain/board-representation.md`). Hits implied.
- Do not import `move-dumper`. Do not treat SGF as a training representation.
