# Architecture Decision Records

When something is decided (encoding, eval target, language, dump format), write an ADR here. Do not leave the decision only in chat.

Use the `record-decision` skill. Number files `0001-short-title.md`, `0002-...`.

## Template

```markdown
# NNNN Title

- Status: accepted | superseded | rejected
- Date: YYYY-MM-DD
- Supersedes: (optional ADR number)

## Context

What problem or choice existed.

## Decision

What we will do.

## Consequences

What becomes easier, harder, or now forbidden. Update
`docs/domain/` if the decision changes a contract.
`0000-open-questions.md` if the question is now closed.
```

Do not silently pick items still listed in [0000-open-questions.md](0000-open-questions.md).
