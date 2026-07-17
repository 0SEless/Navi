# SPEC: Campus Authoring

## Problem Statement
Administrators need to create and manage campus data in NAVI Studio. Currently, there is no way to create a campus from scratch within the application.

## Goals
1. Create a new campus with metadata (name, coordinate system, default settings)
2. Draw campus boundary on the map
3. Save and load campus data
4. Set campus properties via inspector panel

## Acceptance Criteria
- [ ] User can create a new campus from the UI
- [ ] User can set campus name and description
- [ ] User can draw a campus boundary polygon
- [ ] Campus data persists to database
- [ ] Campus appears in the campus list
- [ ] User can open an existing campus for editing
- [ ] Changes auto-save

## Technical Considerations
- Uses existing canvas system (MapCanvas.tsx)
- Leverages command bus for undo/redo
- Stores data in Supabase (campuses table)
- Follows existing entity renderer pattern

## Out of Scope
- Building authoring (separate spec)
- Floor plan upload (separate spec)
- Publishing (separate spec)

## Related Files
- `navi-next/apps/studio-new/components/MapCanvas.tsx`
- `navi-next/apps/studio-new/lib/entity-renderer.ts`
- `navi-next/apps/studio-new/lib/commands/command-bus.ts`
- `navi-next/supabase/migrations/001_initial_schema.sql`
