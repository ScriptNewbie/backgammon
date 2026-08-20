# 0003 Doubling cube support

- Status: accepted
- Date: 2026-08-20

## Context

v1 docs targeted cubeless money equity only. The product needs the doubling cube: cube value, ownership, cube action, and cubeful equity.

Neural nets generalize poorly if cubeful equity is the only training target (cube state explodes the input and labels). Established bots (GNU Backgammon and similar) predict **cubeless outcome probabilities**, then wrap cube decisions on top.

## Decision

- Position JSON always includes cube state (`value`, `owner`, who may double).
- The **net** is trained on **cubeless** outcome probabilities (side-to-move).
- **Cubeful equity** and **cube action** (no-double / double / take / drop) are first-class API outputs, produced from those probabilities plus cube state (formula and/or a small cube wrapper — implementation choice later, not a new board encoding).
- Dumps from bgweb-api store cubeless probabilities and cubeful equity when requested. Cube-action labels are **not** available from that API yet (`cubeAction: null`).

Match play (match length, Crawford, match equity) is **not** in this ADR; money play with a cube is.

## Consequences

Do not train the main net on cubeful equity alone. Do not omit cube fields from the position JSON. Ranking checker plays in the API uses cubeful equity. See [docs/domain/evaluation.md](../domain/evaluation.md).
