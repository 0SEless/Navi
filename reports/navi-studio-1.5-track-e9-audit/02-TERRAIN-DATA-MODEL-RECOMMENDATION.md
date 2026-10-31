# Terrain Data Model Recommendation

Use a versioned regular height grid as the sole editable continuous surface, stored as bounded tiles (128×128 candidate). Tile values: Float32 plus explicit validity/no-data mask. Metadata: projected CRS/reference and origin, meter spacing, dimensions, campus datum ID/status, encoding version, canonical tile order, tile and aggregate checksums. Mesh/LOD are derived. Keep E8 polygons as independent annotations/constraints; do not silently rasterize them.

| Model | Tradeoff | Recommendation |
|---|---|---|
| Regular grid | Predictable brushes and samples; uniform resolution costs | Canonical first surface |
| TIN | Adaptive detail; harder stable topology/edit/undo | Later import or derived option |
| Grid + independent controls | Easy handles; divergent authority | Avoid; handles edit grid or are explicit versioned constraints |
| Dense JSON blob | Simple tiny prototype; high serialization/history cost | Avoid at scale |

Estimates, not benchmarks: 5 m spacing yields about 10,201 samples/40.8 KB raw Float32 for 500 m square, 40,401/161.6 KB for 1 km square. At 2 m: 63,001/252 KB and 251,001/~1 MB. Add mask, metadata, JSON/JSONB, transport and GPU copies. A 5 m 1 km grid has ~79,202 triangles. Alignment changes counts. Candidate 5 m authoring, 128 samples/tile, 10 m overview LOD must be validated with actual byte, memory, latency and device measurements. Enforce cell/byte caps before document mutation.
