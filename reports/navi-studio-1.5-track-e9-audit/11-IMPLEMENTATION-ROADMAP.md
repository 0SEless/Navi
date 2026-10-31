# Implementation Roadmap

Recommendations only; not implemented in this audit.

1. Owner selects CRS/datum, spacing/cell/payload caps, precision/no-data, locks/foundation policy, renderer, publish format and budgets.
2. Add versioned tile schema, validators, deterministic order/checksum, bounds/mask; preserve polygons; synthetic serialization tests.
3. Add private preview, brush/lasso/lock, one reversible tile-delta command per stroke, cancellation, overlays and memory limits.
4. Integrate one terrain scope and IndexedDB draft; synthetic explicit-save E5 proof, exact checksums, unchanged scopes/failure recovery; remain opt-in/off by default.
5. Benchmark report 04 matrix; verify undo/redo/replay/corruption/restart; set limits and tile-scope trigger.
6. After vertical decision, add preview-only foundation/excavation operators, conflicts, locks and reversible recomputation.
7. Version compiler/runtime artifacts, derived mesh/LOD, atomic publishing, legacy compatibility and browser acceptance.
8. Separate release gate for security, accessibility, performance, recovery, flag off by default, rollback and owner approval.
