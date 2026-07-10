# NAVI Architecture v1.0 — Freeze Checkpoint

**Date:** 2026-07-08
**Status:** FROZEN — no further architecture design until Phase 0 implementation validates these decisions.

---

## Frozen Decisions

| # | Decision | ADR | Documented In | Status |
|---|----------|-----|---------------|--------|
| 1 | CampusDocument is the single source of truth | ADR-0006 | `project-model.md` | ✅ Frozen |
| 2 | NavigationGraph is always compiled, never hand-edited | ADR-0002 | `engine-architecture.md` | ✅ Frozen |
| 3 | Commands are the only mutation mechanism | ADR-0003 | `command-system.md` | ✅ Frozen |
| 4 | Three-tier validation pipeline (advisory/blocking/blocking) | ADR-0004 | `validation-system.md` | ✅ Frozen |
| 5 | Strangler Fig migration from legacy Graph | ADR-0005 | `PLAN.md` §5 | ✅ Frozen |
| 6 | Two-lifecycle separation (editing vs publishing) | ADR-0006 | `publishing-pipeline.md` | ✅ Frozen |
| 7 | Per-entity coordinate storage (world vs building-local) | ADR-0007 | `coordinate-system.md` | ✅ Frozen |
| 8 | Hybrid undo strategy (inverse for small, snapshot for bulk) | — | `history-system.md` | ✅ Frozen |
| 9 | xxHash64 internal + SHA-256 publishing | — | `asset-management.md` | ✅ Frozen |
| 10 | Runtime never recompiles NavigationGraph | — | `navi-runtime-architecture.md` | ✅ Frozen |
| 11 | Offline-first — project is self-contained | — | `principles.md` | ✅ Frozen |

---

## Architecture Documents (22)

| Document | Type | Status |
|----------|------|--------|
| `vision.md` | Core | ✅ Frozen |
| `principles.md` | Core | ✅ Frozen |
| `architecture.md` | Core | ✅ Frozen |
| `terminology.md` | Core | ✅ Frozen |
| `project-model.md` | Core | ✅ Frozen |
| `project-manifest.md` | Core | ✅ Frozen |
| `coordinate-system.md` | Core | ✅ Frozen |
| `data-contracts.md` | Core | ✅ Drafted |
| `editor-architecture.md` | Editor | ✅ Drafted |
| `interaction-model.md` | Editor | ✅ Drafted |
| `rendering-architecture.md` | Editor | ✅ Drafted |
| `command-system.md` | Editor | ✅ Drafted |
| `history-system.md` | Editor | ✅ Drafted |
| `validation-system.md` | Editor | ✅ Drafted |
| `engine-architecture.md` | Engine | ✅ Drafted |
| `asset-management.md` | Engine | ✅ Drafted |
| `floor-plan-calibration.md` | Engine | ✅ Drafted |
| `save-system.md` | Engine | ✅ Drafted |
| `publishing-pipeline.md` | Publishing | ✅ Drafted |
| `search-architecture.md` | Runtime | ✅ Drafted |
| `plugin-boundary.md` | Boundary | ✅ Drafted |
| `permission-system.md` | Boundary | ✅ Drafted |
| `navi-runtime-architecture.md` | Runtime | ✅ Drafted |

---

## ADRs (7)

| # | Title | Status |
|---|-------|--------|
| 0001 | Immutable Entity Identifiers | Accepted |
| 0002 | NavigationGraph as Compiled Artifact | Accepted |
| 0003 | Commands as the Only Mutation Mechanism | Accepted |
| 0004 | Three-Tier Validation Pipeline | Accepted |
| 0005 | Strangler Fig Migration Pattern | Accepted |
| 0006 | Two-Lifecycle Separation (Editing vs Publishing) | Accepted |
| 0007 | Per-Entity Coordinate Storage | Accepted |

---

## Development Plan

See `PLAN.md` for the full roadmap. Current phase: **Phase 0 — Foundation** (Core types, CampusDocument, serialization, geometry engine, project scaffold).

### Milestones

| # | Milestone | Phase | Status |
|---|-----------|-------|--------|
| M0 | Foundation | Phase 0 | 🔜 Next |
| M1 | Spatial Engine | Phase 1 | 🔲 |
| M2 | Core Spatial Editor | Phase 2 | 🔲 |
| M2.5 | Demo Dataset | Phase 3 | 🔲 |
| M3 | Campus Authoring | Phase 4 | 🔲 |
| M4 | Navigation Compiler | Phase 5 | 🔲 |
| M5 | NAVI Runtime | Phase 6 | 🔲 |
| M6 | Deployment + Evaluation | Phase 7 | 🔲 |

---

## Repository Structure

```
navi/
├── apps/
│   ├── studio/        → NAVI Studio (authoring UI)
│   └── runtime/       → NAVI user app (PWA)
├── packages/
│   ├── core/          → Types, geometry, coordinates, serialization
│   ├── compiler/      → Navigation compiler, search index builder, publisher
│   ├── editor/        → Commands, tools, history, validation
│   └── runtime-core/  → Routing, search, offline (shared with runtime app)
├── docs/              → Architecture docs + thesis
└── scripts/           → Demo dataset, benchmarks
```

---

## What Comes Next

Stop designing. Build Phase 0:

1. `packages/core/types` — All entity interfaces with typed coordinates
2. `packages/core/serialization` — CampusDocument ↔ JSON round-trip
3. `packages/core/geometry` — area(), centroid(), contains(), distance()
4. Tests proving the model works
5. Demo dataset script (ASU-Ibajay)
