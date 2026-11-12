# Open questions

Agents must **not** silently pick these. When the user decides, write an ADR and remove the item from this list.

Closed: player labels (0001), representations (0002), doubling cube (0003), game-engine language/inference (0004), dump file format (0005), teacher engine bgweb-api (0006, superseded by the gnubg CLI sidecar 0031), skill levels/pairing (0007), match play (0008), dump metadata/SGF (0009), SGF replay viewer package (0010), Docker-only runtime (0011), training data layout (0012), CUDA training image (0013), ONNX and ExecuTorch `.pte` export (0014), teacher cubeless MLP (0015), shared `ts-core` package (0016), Hono HTTP (0017), cube wrap formula (0018), battle-arena package (0019), dumper games without cube (0020), featurized tensor cache (0021), Hedgehog as an external arena opponent (0022), Hedgehog plays its own decisions (0030), any driver versus any driver (0023), `gui` package with Tailwind (0026), GUI play mode against game-engine (0027).

## Still open

- [ ] Jacoby rule, beavers/raccoons (money-play cube variants).
- [ ] Pin the Debian `gnubg` package version in `docs/integrations/gnubg/Dockerfile` (it follows `bookworm`; bgweb-api was retired in 0031).
