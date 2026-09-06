# NAVI Capture Phase 4 — Studio Capture Library

## What this feature does

Phase 4 adds a campus-scoped, read-only Studio Capture Library at:

`/studio/[campusId]/edit/capture-library`

It lists the authenticated owner's synced Capture sessions for the current campus and opens a selected session in the existing Studio Capture Reviewer through `?sessionId=<id>`.

## Success criteria

- Remote summaries are read through the provider-neutral Capture cloud boundary and filtered by the authoritative campus ID.
- Full-session opening validates the route campus and the remote session campus before display or import.
- Library browsing never falls back to local sessions and never mutates Studio document/editor state.
- Existing Phase 2C outdoor pathway preview/import remains the only mutation path.
- Empty, unavailable, unauthorized, deleted, malformed, and temporary-error states fail closed with recovery messaging.
- Existing Capture, Reviewer, import, Studio/editor, compiler/navigation, runtime/public compatibility, and route baselines do not regress.

## Explicit exclusions

No new schema or migration, global library, remote deletion, recorder/sync changes, indoor routing, marker import, Road/editor redesign, compiler, publish, runtime, service-worker, or NAVI Web work is part of Phase 4.

Detailed design: `navi-next/docs/superpowers/specs/2026-08-31-navi-capture-phase4-studio-library-design.md`.
