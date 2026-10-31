# Track E1 — Studio Integration Map

## Existing edit and persistence paths

| Concern | Current path | E1 interaction |
|---|---|---|
| Studio entry and floor selection | `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, `src/components/floor-editor/FloorEditor.tsx` | Left in place. The current floor/building identity and editing tools remain authoritative. |
| Building, floor, room, wall, door, entrance and route edits | Editor commands mutate `EditorContext.document`; `DocumentEventBus` emits `document.changed` and `src/components/studio/EditorBridge.tsx` synchronizes the document to the legacy `Graph` projection | E1 observes the resulting document snapshot after the existing event handling and classifies supported changes. It does not create a second editable graph. |
| Route graph and outdoor graph projection | `GraphAdapter` plus `src/store/graph-store.ts` graph/node/edge actions; authored routing content remains in the document | Routing projection is emitted as building routing or campus routing scopes. Unsupported document data is rejected from scoped history. |
| Terrain and campus settings | `CampusDocument` `boundary`, `areas`, schema, metadata and connectivity semantics fields | Mapped to `terrain` and `campus-settings` scopes when present. |
| Dirty state | Editor workflow `snapshot.saveState`, authored mutation tracking and graph-store sync/conflict state | E1 local-history status is additive and does not mark workflow/cloud state saved. |
| Local draft autosave | `src/store/graph-store.ts` `save()` and `src/services/studio-local-drafts.ts` IndexedDB repository, gated by the existing development local-drafts flag | Continues unchanged. Recovery gate blocks editor mount until recovery settles or a user selects a recovery action. |
| Manual Cloud Save | `EditorBridge` persistence adapter → `src/components/studio/studio-persistence.ts` → graph-store `syncToSupabase()` / `/api/graph` | Existing path remains the cloud-save path. E1 scoped operations never call it. |
| Save queue and retries | `src/store/graph-store.ts` per-campus `/api/graph` queue, expected-revision checks and retry/conflict state | Unchanged. Existing queue and route compatibility are covered by regression tests. |
| Reload and recovery | `StudioLocalDraftRecoveryGate` → IndexedDB draft validation/recovery; server snapshot comparison can surface a conflict | Reload can recover the durable IndexedDB draft. Scoped history is a fresh page session and is not represented as recovered. |
| Publish | Editor publish service → `/api/publish` and existing published revision flow | Not changed or invoked by E1. |

## New scoped reference path

`document.changed` → `createScopedHistoryDevClient` → `POST /api/dev/scoped-history` → Development/loopback gate → D6 `commitScopedBatch` and `InMemoryScopedCommitStore`.

The route has no Supabase imports. Its in-memory receipts and revisions are local reference results only. The client retains the exact serialized request across a retry after a lost response. A reload creates a new session ID and baseline from the recovered editor document; the old in-memory history is not queried or restored.
