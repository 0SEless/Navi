# Progress Ledger

## M4 — Navigation Compiler
- **Plan review**: User provided 10 architectural fixes; all addressed.
- **Task 1** (scaffolding + types): complete `4d4f2ab..de954f7` — review approved with minor notes
- **Task 2** (extractor interface + coordinator): complete `de954f7..c3be5d2` — review approved
- **Architectural fixup**: complete `850b3c0` — CompilerConfig rename, LatLng import, validation rework, smoke test, etc.
- **Package restructuring**: complete `76724f9` — exports field, simplified tsconfig, types/index.ts, scaffolded dirs (graph/, artifacts/, publisher/, pipeline/), compiler.ts + pipeline/compile.ts

## M2.2 � Explorer Migration
- **Task 1**: complete (252f22e..3427c0f, 1 file, review clean)
- **Task 2**: complete (3427c0f..3e7289f, 3 files, review clean). Notes: React.memo needs parent callback memoization to be effective; search marks first match only (future gap); test-setup.ts cleanup added (justified).
- **Task 4**: complete (b1a6328..bdedd4e, 2 files, review Approved). Note: API freeze updated to alue/onChange/matchCount (was contradictory with brief's searchQuery/onSearchChange); brief + impl agree, plan updated to match.
- **Task 5**: complete (bdedd4e..d7104fd, 2 files, review Approved). Two brief bugs fixed: (1) infinite loop via useState mutation ? useRef; (2) sibling-preservation rule not implemented ? filterTree+markInPath. Search rule verified correct. API freeze updated: useExplorerView returns matchCount + expandAncestors (no isExpanded).
- **Task 6**: complete (d7104fd..5ad358c, 2 files, review Approved). Explorer owns UI state via useExplorerView; no EditorContext/command leakage; empty states present. Note: 85 pre-existing repo-wide tsc errors (unrelated); this task adds zero.
- **Task 7**: complete (5ad358c..3836c46, 3 files, review Approved). ExplorerAdapter pure wrapper; ExplorerPanel integration-only (useEditor+useSelection+ExplorerAdapter). Command adapted to real API: dispatcher.execute({id:'entity.update', payload:{entityId, changes:{name}}}) (plan's RenameEntityCommand/dispatch() was design-assumption, not in codebase). Plan updated to match.
- **Task 8**: complete (3836c46..5dd1444, 4 files, review Approved). Inline rename via local-state double-click edit; onRename threaded Item?Tree?Explorer. Note: implementer omitted Explorer.tsx from first commit; follow-up 5dd1444 added it. Minor: Escape-after-edit edge untested (React-safe: no onBlur on unmount).
- **Task 9**: complete (5dd1444..9c642b6, 7 files, review Approved). Context menu with Rename + Delete; getExplorerActions robust (only defined handlers); onDelete wired in ExplorerPanel via ${type}.delete + ${type}Id (verified against all 10 delete handlers). Minor: campus root shows dead Delete item (fix: pass undefined for campus).
- **Task 10**: complete (9c642b6..9ae78cd, 6 files, review not required - final integration). EditorBridge created, StudioWorkspace wired, LeftPanel removed. grep gate clean. 736/736 tests pass. **M2.2 Explorer Migration COMPLETE**.

## M2.3 — Inspector Migration (2026-07-10)
**Status: COMPLETE (7 tasks, 742/742 tests).** Inspector now reads/writes `CampusDocument` via `entity.update` command; legacy canvas remains read-only (write-back deferred to Phase 4 Navigation Compiler).
- **T1**: complete (00b3784). `EditorBridge` builds context ONCE (lifetime invariant); registers `DocumentStore` + `CommandDispatcher`(entityUpdateHandler) + `HistoryStack`(pre/postHook) + `SelectionManager`. `CommandDispatcher.execute` frozen order: handler → history → `documentStore.commit()` → `document.changed`. `useDocumentVersion` + `DocumentStore` created.
- **T2**: complete (a20bc0c). `PropertiesPanel` + `ExplorerPanel` use `useDocumentVersion()` for version-driven re-render (no EventBus rendering subscription).
- **T3**: complete (9aa3555). `SelectionBridge` wired both directions (canvas↔SelectionManager), selection-only, loop-guarded.
- **T4**: complete (9e8e663). `PropertiesPanel` mounted in right slot inside the SINGLE `EditorBridge`; legacy `RightPanel` usage removed.
- **T5**: complete (2189430). Legacy inspector cluster (RightPanel, NodePropertiesPanel, MetadataPanel, TracePropertiesPanel, StaircasePropertiesPanel) relocated to `src/components/studio/legacy/` via `git mv` (kept as reference; deleted after M2.6).
- **T6**: complete (3fd2a8f). Integration test `InspectorMigration.test.tsx` (6 tests) proves select→panel, edit→document+re-render, undo→revert, selection persists, document-reference stable, and canvas→Inspector via bridge. **Bug found + fixed**: `DocumentStore` lacked `dependencies` field → `registry.init` threw `svc.dependencies is not iterable`, breaking the real bridge at mount; fixed by adding `dependencies: readonly string[] = []`. 742/742 tests pass. Grep gate clean (only a sanctioned comment in selection-bridge.ts).
- **Design decisions (user-reviewed)**: CampusDocument = editable model; Graph = rendering/compiled artifact (Phase 4 renamed "Navigation Compiler"); DocumentStore (not EventBus) drives React re-render; version/revision are editor metadata, not domain data; frozen command execution order; SelectionBridge selection-only.
**M2.3 Inspector Migration COMPLETE.**
