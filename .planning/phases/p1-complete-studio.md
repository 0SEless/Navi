# Phase P1: Complete NAVI Studio

## Goal
An administrator can author an entire campus without leaving NAVI Studio.

## Exit Criteria
- Administrator can create a campus from scratch
- Administrator can publish the campus
- No critical validation errors remain

## Scope
All campus authoring capabilities:
- Campus creation and metadata
- Building authoring (add, remove, rename, position, footprint, floor plans)
- Floor authoring (add, remove, reorder, elevation, labels, floor plans)
- Room authoring (trace boundaries, name, categorize, edit properties, move/resize)
- Hallway/corridor authoring (trace paths, connect to rooms, edit properties)
- Road/path authoring (draw roads, connect to entrances, edit properties)
- Indoor transitions (stairs, elevators, connect to hallways)
- Asset management (QR markers, panoramas, edit properties)
- Validation & auto fix (on-demand, categorized warnings/errors, auto-fix, incremental)
- Publishing (one-click, preview, manifest)
- Studio polish (keyboard shortcuts, undo/redo, zoom/pan/snap, inspector, workflow indicator)

## Dependencies
- Walking Skeleton (completed) — architecture proven end-to-end
- Database schema (migrations 001-004) — tables and RLS policies
- Supabase backend — auth, storage, real-time

## Success Metrics
1. Can create a campus with 5+ buildings without errors
2. Can trace room boundaries on floor plans
3. Can publish a campus and view the manifest
4. Validation catches 100% of critical errors
5. Auto-fix resolves common issues

## Notes
This phase focuses on the authoring experience. Visitor-facing features (search, routing, QR navigation) are in P2 (Complete NAVI Runtime).
