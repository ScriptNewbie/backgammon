# Open questions

Agents must **not** silently pick these. When the user decides, write an ADR and remove the item from this list.

Closed: player labels (0001), representations (0002), doubling cube (0003), game-engine language/inference (0004), dump file format (0005), teacher engine bgweb-api (0006).

## Still open

- [ ] Training data layout under `training-ground` (directory names, train/val split policy, optional JSONL→cache conversion).
- [ ] `game-engine` HTTP framework.
- [ ] Cube wrapper: formula vs a small learned cube head (main net stays cubeless either way). bgweb-api does not emit cube actions yet.
- [ ] Jacoby rule, beavers/raccoons (money-play cube variants).
- [ ] Match play (match length, Crawford, match equity).
- [ ] Pin `foochu/bgweb-api` image digest instead of `:latest`.
