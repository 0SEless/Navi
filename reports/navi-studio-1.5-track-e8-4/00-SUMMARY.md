# Track E8.4 — Terrain Authoring Foundation

**Status: PASS — synthetic terrain authoring, save, and fresh-context recovery verified.** This closes the E8.4 foundation criteria only; it does not complete a terrain mesh/editor or add terrain to the published runtime format.

NAVI Studio now supports campus-level authored terrain areas: draw a polygon, select it, name it, set its finite authored elevation relative to one campus-local vertical datum, adjust its boundary, and delete it. Invalid/self-intersecting/degenerate polygons and non-finite elevations are rejected. Overlaps remain allowed and conflicting elevations are visibly flagged. Terrain is an authored polygon representation, independent of MapLibre and future mesh generation. One campus-wide `terrain` scope stores the collection; areas do not receive separate revisions.

The final live browser test used synthetic campus `navi-e8-browser-fec85186572d4c47` and local E5 only. Studio drew and adjusted the synthetic lawn, saved one terrain operation with a durable acknowledgment, then a fresh browser context recovered the exact area, datum, and elevation from PostgreSQL. A stale writer got HTTP 409 and retained its IndexedDB draft; a forced network failure retained its draft without committing another revision. The existing publish flow reached Build Ready and completed through an intercepted synthetic endpoint; no cloud publish occurred.

The measured vertex drag generated 13 pointer-move events, one document command, one document change, and zero scoped-save requests. Explicit Save sent one candidate in one request and committed one `terrain` operation. The independent E5 check found revision 1, one receipt, one checkpoint, matching reconstructed checksum, and revision 0 for building, routing, and campus-settings scopes. Focused unit suites pass (7 files, 31 tests). ESLint passes on the E8.4-owned TypeScript/TSX/E2E files. TypeScript remains non-clean: 1,123 diagnostics versus the E8.3 baseline of 1,124; no E8.4-owned file has a new diagnostic.

The published legacy artifacts do not contain `terrainAreas`. The next milestone is terrain publish/runtime compatibility and rendered terrain semantics, followed by broader editor polish; keep the E5 path opt-in and disabled by default until separately approved.

Detailed evidence: [browser and gesture](02-BROWSER-AND-GESTURE-EVIDENCE.md), [PostgreSQL](03-POSTGRES-INTEGRITY.md), [publish](04-PUBLISH-COMPATIBILITY.md), [regressions and gates](05-TESTS-AND-RELEASE-GATES.md). Final raw logs are in `logs/run-fec85186572d4c47ae905ff8e03a0222/`.
