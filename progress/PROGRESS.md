# Progress Log

## 2026-07-19: Phase 1 — Building Inspector Redesign — complete

- Reorganized `building-props.tsx` sections to spec order: Information, Physical, Status, Actions, Assets, Danger Zone
- Moved Color from Information to Physical
- Replaced "Building Completion" checklist with compact Status section using `usePublish()` (Build Status + Last Published)
- Changed "Open Floor Editor" → "Edit Interior" button label
- Simplified Assets: removed photo/thumbnail uploads, kept Floor Plans + added Panoramas status
- Updated building-props.test.tsx + PropertiesPanel.test.tsx (33 tests passing across 10 files)
- **Next**: Phase 2 — Manage Floors

## 2026-07-19: Interior Editor Alignment Plan v2 — complete

- Conducted comprehensive exploration of entire codebase (5 packages, 100+ source files)
- Produced gap analysis comparing existing Floor Editor implementation vs UX specs
- Reframed remaining work from "greenfield design" to "alignment project" after user review
- Locked 6 architecture decisions: Context Header design, Floor Manager placement, Building Entrance entity model, Tool Dock grouping, SV1 validation gate, terminology migration timing
- Wrote frozen PLAN.md with 6 phases (P1–P4.5–P5–P6) + guiding principle + error prevention
- **Next**: Begin Phase 1 — Context Header (FloorEditor.tsx)

## 2026-07-17: T22 ArtifactHydrator — complete

- Wrote spec/T22-artifact-hydrator.md + plan/T22-artifact-hydrator.md
- Implemented `ArtifactHydrator` class with `hydrate<T>(content, validator): Promise<HydrateResult<T>>`
- Implemented `ArtifactValidator<T>` interface with registry pattern (zero if/else on artifact type)
- Implemented 4 validators: graph, search, building, poi
- 10 new tests covering: valid JSON per artifact type, invalid JSON, missing schemaVersion, wrong schemaVersion, missing fields, wrong top-level type, null
- All 85 tests green (75 old + 10 new), no type errors
- **Next: T23 — ReferenceValidator** (cross-reference IDs between artifacts)
