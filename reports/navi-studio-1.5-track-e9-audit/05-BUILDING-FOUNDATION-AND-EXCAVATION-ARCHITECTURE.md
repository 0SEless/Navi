# Building Foundation and Excavation Architecture

Keep authored grid as base. Compute deterministic effective surface: `authored grid + manual edits → foundation/excavation operators → derived surface/mesh`. An operator references stable building ID, campus-datum foundation height, footprint revision, margin/falloff and algorithm version. Recompute after building movement; never destructively subtract terrain. Keep derived checksum and cut/fill estimate.

Building base elevation currently means MSL, not campus-local. Add explicit specified/unspecified campus foundation elevation. No conversion without known vertical transform and owner approval. Unspecified foundation blocks excavation only. A candidate operator flattens under footprint and blends to original across a margin; margin and cut/fill integration need owner decisions. Label volumes estimates for authored-not-surveyed data.

Disjoint operators compose. Unequal overlapping foundations block with conflict, never last-writer-wins. Locked samples block operators unless an explicit audited override is authorized. Unknown elevations block excavation, not terrain editing. Moving/removing a building recomputes/removes derived operation and reveals untouched base. Preview conflicts before publish.
