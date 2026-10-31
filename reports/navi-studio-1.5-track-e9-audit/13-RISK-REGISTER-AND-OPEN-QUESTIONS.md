# Risk Register and Open Questions

| Risk | Mitigation/decision |
|---|---|
| CRS/datum undefined | Choose explicit references; reject incomparable values |
| Building MSL vs terrain datum | No automatic conversion; supply known transform |
| Large scope/checkpoints | Measure bytes/time/WAL; set caps and tile-scope trigger |
| No-data/Float32 ambiguity | Explicit mask, precision, edge/interpolation rules |
| Full snapshots inflate history | Sparse tile deltas and memory cap |
| Per-pointer mutations | Private preview and one completed-stroke command |
| Excavation overlaps | Explicit conflict, no last-writer-wins |
| Lock precedence unclear | Locks block pending override policy |
| Artifact/client mismatch | Version/checksums, atomic publish, legacy tests |
| GPU/storage variability | Benchmarks, fallback, quota handling |

## Owner questions

1. Which CRS/projection and campus origin define meters?
2. Which vertical datum and building-base conversion apply?
3. Are 5 m spacing/128-sample tiles test candidates? Max extent/cells/payload?
4. Float32, no-data, interpolation and edge policy?
5. Are control points grid handles or persisted constraints?
6. Can excavation override locks? How resolve overlaps?
7. Margin/falloff and cut/fill policy?
8. Approve Three.js preview or MapLibre-only?
9. Publish source grid, mesh or both? Client compatibility window?
10. What measured limit triggers tile revisions?
11. Brush contextual shortcut and existing B behavior?
12. Target devices and performance thresholds?
