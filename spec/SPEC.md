# M3.2.2 Wave B — FloorEditor reads from CampusDocument + writes via Commands

## What

Migrate FloorEditor subsystem from reading `graph.components` via graph-store to reading entity geometry from **CampusDocument** (the source document), and from writing through graph-store actions to dispatching **commands**.

## Success Criteria

1. `createDocument(graph)` populates floor-level entities (rooms, hallways, staircases, elevators, entrances) with real geometry from `graph.components`, converting world coords → local coords via `CoordinateTransformer`
2. `CoordinateTransformer` registered as an editor service, initialized with building-local systems from building footprints
3. `floor-graph-selectors.ts` reads from `CampusDocument` via `useEditor()` + `useDocumentSelector()`, converting local-coord geometry back to world-coord `Component[]` for backward compat
4. FloorEditorCanvas dispatches `room.delete` / `hallway.delete` / `entity.update` commands instead of `removeComponent()` / `updateComponent()`
5. useFloorDrawing dispatches `room.create` instead of `addComponentWithPolygon()`
6. FloorOutliner dispatches entity delete commands instead of `removeComponent()`
7. ComponentProperties dispatches `entity.update` / delete commands instead of `updateComponent()` / `removeComponent()`
8. All 896+ tests pass; no new type errors

## Known Pitfalls
- CoordinateTransformer must be initialized before createDocument to convert graph components (world→local)
- World→local and local→world round-trip must be exact (test with real building footprints)
- GraphAdapter.sync() must run after document mutations to keep graph-store in sync for navigation compiler

---

# Production Studio conflict recovery action

## What

The exact red Studio synchronization-conflict banner must expose an obvious
`Re-sync` action that safely retries preserved local work through the existing
save queue/CAS path. Missed acknowledgements must auto-heal without a second
POST, genuine divergence must preserve both sides, and authentication failures
must be labeled as authentication failures.

## Success Criteria

1. The rendered conflict banner shows `Re-sync` beside its warning.
2. Local-ahead recovery posts through the normal queue with the latest server revision and records the acknowledgement.
3. Server-equals-local with a stale marker adopts the server revision without POSTing.
4. Genuine divergence and retry failure leave local data preserved and conflict visible.
5. HTTP authentication failures show the sign-in-again message, while Road Recovery remains unchanged.
6. Multi-row conflict recovery controls remain visually contained in the Studio header at the reported production viewport; the map pane must begin below them instead of painting over them.

## Known Pitfalls

- Do not remove the conflict gate from normal autosave.
- Do not force overwrite or add a new endpoint.
- Preserve the existing server fingerprint and CAS revision boundaries.
- A control being present in the accessibility tree is insufficient: verify its bounding box is inside the header and visually unobscured.
- Focused Vitest workers and Graphify may require the documented Windows elevated path.

---

# Production Studio harmonious autosave drag lifecycle

## What

Connect the existing transient-interaction autosave gate to the real Studio
building-drag and authored-vertex-drag lifecycles. Only an actual moved gesture
may block the existing 5-second and 30-second autosave windows; selection,
hover, idle edit mode, and click-without-move must leave the gate inactive.
Every commit, cancel, pointer cancellation, tool-switch cleanup, error cleanup,
and component teardown must release the gate.

## Success Criteria

1. A genuinely moved building drag sets the existing autosave transient signal
   active until commit/cancel, while a selected-but-idle building leaves it
   false.
2. A genuinely moved authored vertex drag has the same active/inactive
   lifecycle; click-without-move does not activate it.
3. Active building/vertex gestures suppress both existing autosave timers, and
   commit resumes the existing guarded debounce without changing sync timing or
   recovery behavior.
4. Escape, pointer cancellation, tool-switch cleanup, thrown cleanup where
   relevant, and unmount while dragging all release the signal.
5. Focused handler, autosave, recovery, session/supersession, and road/area
   regression tests pass; the production build remains green.

## Known Pitfalls

- Do not gate autosave from tool selection alone; only unfinished gestures may
  set the signal active.
- Do not alter the autosave service, sync queue, conflict/recovery UI, Road
  Recovery, routing, POIs, or Floor Editor architecture outside the gesture
  call sites.
- Keep the Windows Vitest `spawn EPERM`, nested-worktree root, external
  dependency junction, and ignored-env build issues classified as environment
  setup errors rather than changing source behavior.

---

# Production Studio post-recovery reload convergence

## What

Keep the authoritative graph, local cache, sync marker, and active
CampusDocument aligned after recovery or server adoption so a no-edit reload
cannot recreate a conflict. Authoritative graph replacement must update the
existing editor document without creating an authored revision or triggering a
network save.

## Success Criteria

1. Force overwrite, server adoption, and local-ahead recovery leave the
   server, marker, cache, graph store, and CampusDocument projection
   equivalent before reload.
2. A full reload with no user mutation preserves the same fingerprint and
   does not write a new local draft or POST solely because hydration ran.
3. Normal authored edits still persist locally and autosave after the existing
   5-second debounce; genuine server/local divergence remains protected.
4. Graph → CampusDocument → Graph remains fingerprint-stable for the
   synchronized authored state.
5. The fix is limited to post-recovery/document reconciliation; autosave
   timing, gesture wiring, Road Recovery, routing, POIs, auth, and schema are
   unchanged.

## Known Pitfalls

- `GraphAdapter.sync(document)` is document → legacy graph; never use it to
  reconcile an authoritative graph into a stale document.
- Authoritative replacement must not emit `revision.committed`, otherwise
  hydration is misclassified as an authored edit and autosave can POST.
- Preserve the local recovery backup and existing conflict/CAS protections.
- Treat Vitest worker, isolated-build, env, and Graphify access failures as
  environment boundaries, not product regressions.

## 2026-09-21 — Building delete persistence

### What

Persist an authored building deletion all the way from the CampusDocument
command through the graph adapter, local draft, debounced autosave payload,
server graph snapshot, and a subsequent full reload. A deleted building must
not be resurrected by reconciliation or by an empty local draft during the
autosave window.

### Success Criteria

1. The delete command removes the canonical building ID from the document and
   the graph projection while preserving every other building.
2. The building-delete intent is recorded, the 5-second autosave payload omits
   the deleted building, and the server snapshot omits it after the save ack.
3. A hard reload preserves the deletion; an interrupted debounce still keeps
   the local delete draft and exposes genuine server/local divergence.
4. Undo restores the building where the existing HistoryStack supports it.
5. Existing CAS/conflict handling, autosave timing, auth, routing, POI, and
   unrelated editor systems remain unchanged.

### Known Pitfalls

- A full Studio document is authoritative; merging old out-of-scope canonical
  buildings can resurrect an authored delete.
- Document commands do not automatically create graph-store authored intent;
  the delete event must bridge that intent before autosave's guard runs.
- An empty local graph is a valid delete draft, not proof that no local cache
  exists; never replace it with the stale server graph during reload.
