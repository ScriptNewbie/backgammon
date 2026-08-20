---
name: record-decision
description: Writes an Architecture Decision Record when the user decides encoding, evaluation, language, dump format, or other architecture. Use when the user makes or confirms a project decision, closes an open question, or asks to record an ADR.
---

# Record a decision

Do not leave architecture or domain decisions only in chat.

## Steps

1. Read [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md) and [docs/decisions/README.md](docs/decisions/README.md).
2. If the choice is still listed as open and the user has not decided, stop and ask. Do not pick it.
3. Take the next free number (`0001`, `0002`, …). Skip `0000`.
4. Write `docs/decisions/NNNN-short-title.md` using the template in the README (status, date, context, decision, consequences).
5. Remove or check off the matching item in `0000-open-questions.md`.
6. If the decision changes a contract, update the matching file under `docs/domain/` in the same change.
7. Tell the user the ADR path and what domain docs changed.
8. If you also changed a skill, rule, or subagent, update **both** `.cursor/` and `.grok/` copies.

Do not implement code unless the user also asked for implementation.
