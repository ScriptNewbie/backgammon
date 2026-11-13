# 0033 Embeddable board package

- Status: accepted
- Date: 2026-11-12
- Amends: package lists in [0019](0019-battle-arena.md) and [0028](0028-game-engine-fast.md)

## Context

The board was HTML strings and imperative flyers inside `gui`. Play and replay both need it, and the same picture should drop into a page that is not this app. `gui` stays a vanilla TypeScript app ([ADR 0026](0026-gui-tailwind.md)). XGID is already the interchange encoding ([ADR 0002](0002-board-representations.md)); the decoder lived only in a test helper, and the encoder lived on the Node XG client.

## Decision

- **Package.** An eighth top-level package, `board/`. Vanilla TypeScript. Docker and Compose from that directory, same as the other TypeScript packages ([ADR 0011](0011-docker-only.md)). Demo dev server on port 5174.
- **Custom element.** `<backgammon-board>` uses an open shadow root and adopts the board stylesheet, so a host page needs no extra CSS. The position is an XGID string. Optional `usedDice`, `movable`, and `swap` are JavaScript properties. Clicks emit `point` (`detail.point` is `1`–`24` or `"bar"`) and `swap`. There is no React component.
- **Position.** `positionFromXgid` / `positionToXgid` live in isomorphic `ts-core` (`src/xgid.ts`), re-exported from `ts-core/xg` for the sidecar. The widget parses at the boundary and draws position JSON. No fourth representation. `off` and `mayDouble` stay derived, as in the old test helper. Spent dice are not in an XGID; `usedDice` is a separate property.
- **Motion.** A new XGID diffs against the previous position. New or changed dice spin and land flat. A cube value or owner change pulses. Checker changes fly: a full legal play from `generateLegalSequences` when one reaches the new checker layout (smallest `stepsKey` if several do), otherwise each player’s losses paired to gains in bearing-off direction. A hit blot is already on the bar; only the checker that hit it flies. The destination is painted first, the arriving checker stays hidden under the flyer, and it is shown in the same turn the flyer is removed. The first paint does not animate. Swapping the same two faces does not spin. Animations always run. Changing only `usedDice`, `movable`, or `swap` patches those nodes and does not rebuild the dice.
- **gui.** Stays vanilla. It mounts `<backgammon-board>` and does not draw checkers or dice itself. HUD, play rules, and the SGF parser stay in `gui`.

## Consequences

AGENTS.md lists eight packages. Spec: [board-widget.md](../domain/board-widget.md). `gui` depends on `file:../board`. Rules: `.cursor/rules/board.mdc`, `.grok/rules/board.md`, `.claude/rules/board.md`. The look (solid colors, flat landed dice, no reduce-motion cutout) moves with the widget.
