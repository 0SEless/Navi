# Publishing and Runtime Architecture

E8.5 compiler validates/carries optional terrain polygons/datum. Public `TerrainLayer` renders GeoJSON fill/outline in MapLibre: plan-view only. Current artifacts have no sampled grid, mesh, LOD or excavation operator. Older bundles without optional terrain remain compatible.

Proposed artifact: versioned grid metadata (CRS/origin/spacing/dimensions, datum/status, no-data policy, encoding, tile/aggregate checksums, source revision) and deterministic derived mesh/LOD with generator version/source checksum. Mesh is not another authoring source. Compile/validate everything before an immutable manifest and atomic public-pointer advance. Old polygon bundles keep polygon display; never infer a continuous surface.

Rollout: preserve polygon display; introduce optional grid artifact; add 2D grid/contour/lock view; add derived 3D/mobile LOD; then separately approve public rollout. Test cache/version negotiation, corruption, old clients, atomic update, WebGL fallback and foundation conflicts. Missing/conflicting foundation publish behavior is an owner decision.
