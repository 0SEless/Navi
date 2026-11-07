# Section 5 plan notes (findings before the plan; the plan itself is not written yet)

Spec: docs/superpowers/specs/2026-11-07-navi-terrain-redesign-section-5-studio-layout.md (approved by the owner).
Execution method: inline (owner: no subagents).

Verified while reading the code (2026-11-07):
- Campus settings: no database change needed. PATCH /api/studio/v2/campuses {campusId, name, settings}
  (handlers.ts updateCampus -> studio.update_campus_settings) REPLACES the whole settings object.
  The client path is src/store/campus-map-store.ts: updateMap(id, { boundary }) -> save() -> syncToSupabase
  (v2SettingsOf rebuilds the full settings). The terrain route does not load this store today.
- Create-map wizard (CreateMapWizard.tsx:358) passes the boundary to createMap (settings only); the
  document boundary is never set. terrain.setup (packages/editor/src/commands/terrain-handlers.ts:42-49)
  refuses "Draw the campus boundary first" and also requires a named reference.
- Terrain route: src/components/terrain/TerrainWorkspaceRoute.tsx (dispatch checks the terrain lock for all
  non-structure commands). TerrainWorkspace.tsx shows TerrainFirstVisit when document.terrain is missing.
- Existing pieces to reuse: TerrainLayersPanel.tsx (buildings, roads, contours, tracing; bottom-left box),
  TerrainToolRail.tsx (TERRAIN_TOOLS with keys; vertical rail top-left), TerrainTools.tsx (Import ground
  button + TerrainImportPanel popover; run() shows refusals), useBoundaryEditor.ts (drag corners only,
  dispatches boundary.set), useTerrainLock.ts (useForeignLock holderName; ZoneProvider has forceRelease).
- useTerrainSampler -> createTerrainSampler(document); behaviour with no document.terrain still to check.
- Old box to remove: TerrainAreaAuthoring used in src/components/studio/StudioCanvas.tsx.
- Still to read: TerrainMap.tsx base style (no OSM today), Studio ToolDock look (packages/editor/src/panels/ToolDock.tsx),
  how a holder's user id is exposed for the "Take over here" check.
