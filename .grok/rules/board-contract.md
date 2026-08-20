# Board contract

Follow [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).

Exactly three representations: position JSON (source of truth), feature tensor (train/infer), XGID (gnubg only). Convert XGID at the boundary. Featurize JSON → length-206 STM vector; do not invent another tensor layout.

Players are `p1` / `p2`. JSON `points` are absolute (positive = p1). Point ids in moves are 1–24. v1 dumps include `match` (`length`, `score`, `crawford`); GNU SGF is replay-only, not a fourth encoding.
