# Open questions

Agents must **not** silently pick these. When the user decides, write an ADR and remove the item from this list.

Closed: player labels (0001), representations (0002), doubling cube (0003), game-engine language/inference (0004), dump file format (0005), teacher engine bgweb-api (0006), skill levels/pairing (0007), match play (0008), dump metadata/SGF (0009), replay-player package (0010), Docker-only runtime (0011).

## Still open

- [ ] Training data layout under `training-ground` (directory names, train/val split policy, optional JSONL→cache conversion).
- [ ] `game-engine` HTTP framework.
- [ ] Cube wrapper: formula vs a small learned cube head (main net stays cubeless either way). bgweb-api does not emit cube actions. `move-dumper` uses the dead-cube MWC formula in [match-play.md](../domain/match-play.md); the engine may reuse it or train a head.
- [ ] Jacoby rule, beavers/raccoons (money-play cube variants).
- [ ] Pin `foochu/bgweb-api` image digest instead of `:latest`.
