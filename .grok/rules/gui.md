# gui

Vite + vanilla TypeScript + Tailwind CSS ([ADR 0026](../../docs/decisions/0026-gui-tailwind.md)). Debug viewer for GNU Backgammon SGF dumps ([ADR 0010](../../docs/decisions/0010-replay-player.md)).

- Input is `FF[4]` `GM[6]` match files from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/`. File picker only. No JSONL, no backend, no React.
- From `gui/`. Host commands: [README.md](../../README.md) (http://localhost:5173). Do not run `test:inner` / `dev` on the host. Previous / Next is one checker step or cube action.
- Reconstruct position JSON by applying checker steps and cube double / take / drop from the standard opening (`docs/domain/board-representation.md`). Hits implied. Board helpers and GNU checker-move encode/decode come from `ts-core`. The match-file parser stays here.
- Do not import `move-dumper`. Do not import `ts-core/match`. Do not treat SGF as a training representation.
- Style with Tailwind utility classes. Keep custom CSS to what Tailwind cannot express. Minimal look: solid readable colors, no gradients, no decorative shadows. Dice roll in 3D (short, ease-out spin) and land flat with no tilt. Animations ignore the OS reduce-motion setting.
