# Phase 3 Plan — Context Header

## T1 — Create ContextHeader component

**Description:** Create a standalone `ContextHeader` component with props for building name, floor label, back link href, autosave status, and selection count. No direct dependency on FloorEditor internals.

**Files to touch:**
- `packages/editor/src/panels/ContextHeader.tsx` — NEW

**Props:**
```typescript
interface ContextHeaderProps {
  mapId: string
  buildingName: string
  floorLabel: string
  status: 'saved' | 'saving' | 'unsaved' | 'error'
  statusMessage?: string
  selectedCount?: number
}
```

**Layout:** Left (back link with ← arrow + label), Center (building name / floor label), Right (status dot + label, optional "N selected" badge).

**Acceptance:** Component renders all states correctly from props. No side effects. No imports from graph-store.

## T2 — Wire into FloorEditor, replacing inline header

**Description:** Replace the inline header (FloorEditor.tsx lines 83–110) with the ContextHeader component.

**Files to touch:**
- `src/components/floor-editor/FloorEditor.tsx`

**Changes:**
1. Import ContextHeader from `@navi/editor`
2. Pass props: mapId, building.name, floorLabel, status (from syncStatus), selectedId-based count
3. Remove the inline header JSX block
4. Export ContextHeader from `packages/editor/src/panels/index.ts`

**Acceptance:** No visible change to the rendered header (same information, same position). All existing tests pass.

## T3 — Write ContextHeader tests

**Description:** Test all status states, selection badge, missing building name, long names.

**Files to touch:**
- `packages/editor/src/panels/__tests__/ContextHeader.test.tsx` — NEW

**Acceptance:** 6+ tests covering all status dots, selection badge, back link rendering, missing data.

## T4 — Verify

**Description:** Run full test suite.

**Acceptance:** All existing tests + new tests pass. No regressions.
