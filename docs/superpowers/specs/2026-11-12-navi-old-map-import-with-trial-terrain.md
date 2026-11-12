# Import the old ASU Ibajay map into Save v2, with the trial terrain

Date: 2026-11-12. Status: draft for owner review.

## Goal

Bring the owner's real campus map into Save v2 as a new, separate campus, and lay the terrain sculpted on the Save v2 trial campus under it. The owner then finishes the remaining fixes in Studio and publishes.

## Sources and target

| Role | Where | What is used | Access |
|---|---|---|---|
| Main map | Supabase `navi-development` (`scvgulusmutnzasmgysx`), campus `map-map-1-repe` "NAVI – ASU Ibajay Campus" | `graph_snapshots.authored_document` (the authored CampusDocument, schemaVersion 2) and `campus_maps.data` (name, schoolName, center, boundary) | Read only, one SELECT each |
| Terrain | Supabase `navi-studio-v2` (`ztbnicoiwjghzttchqmp`), trial campus `map-map-5-0y27` "ASU-IBAJAY" | The `terrain` part and its 8 `terrain-tile:*` parts, current versions only | Read only |
| Target | Supabase `navi-studio-v2`, a new campus | Everything above, combined | One create plus one save |

Facts checked on 2026-11-12 (read-only queries):

- The authored document holds 20 buildings (9 with drawn indoor floors), 26 roads, 35 road junctions and 32 POIs; no QR checkpoints, panoramas, terrain or boundary.
- `campus_maps.data.boundary` has 11 points; center is 11.81816502, 122.17017674.
- The trial `terrain` part holds only `terrain` (grid origin 11.8170997658108, 122.16843523135711; reference "Campus ground"; colour range 0–40 m). There are 8 tile parts.
- Building ids in both campuses are the same OpenStreetMap ids (for example `osm-bldg-888026363` is "ADMINISTRATIVE BUILDING" in the old map and "Bldg No. 9" in the trial).

## Rules

1. `navi-development` is never written to. The import only reads it.
2. The trial campus `map-map-5-0y27` is never written to.
3. From the trial campus only the terrain is copied: the `terrain` part content and the 8 tile parts, byte for byte. No buildings, floors, roads, POIs or settings.
4. Nothing from the old document is dropped silently. A field Save v2 cannot place stops the import and is listed in the report; the owner decides per field.
5. The import is one Save v2 commit, so it can be reverted as a whole.
6. The new campus is not published by the import.

## Why the terrain lines up

Terrain is stored against an absolute grid origin (latitude/longitude); tiles are cells in metres from that origin (`packages/core/src/terrain/grid.ts`). Studio derives a new origin from the boundary only when a campus has no terrain (`src/lib/terrain/terrain-start.ts`, `viewDocument`: a document with its own boundary and terrain is returned unchanged). Copying the origin and the tiles unchanged therefore keeps every height on the same ground, whatever the old boundary looks like. Outside the 8 tiles the ground is the flat reference (0 m), as on the trial campus.

The 11-point old boundary must sit inside the area the trial grid covers, or the uncovered strip is simply flat. The dry run reports how much of the boundary lies outside the trial tiles.

## How it works

One TypeScript script in the Save v2 worktree, `scripts/save-v2/import-old-map.ts`, run with `npx tsx`. It reuses Save v2 code; it has no copy of the split or save logic.

### Step 1: export (read only)

Writes two local JSON files under `scripts/save-v2/import-data/`. That folder is added to `.gitignore` first, so map data never lands in git:

- `old-map.json`: the authored document plus `name`, `schoolName`, `center` and `boundary` from `campus_maps`.
- `trial-terrain.json`: the `terrain` part content and each tile part's key, `content_bin` (base64) and checksum.

Steps 2–4 read only these files, so the source databases are touched once.

### Step 2: build the document

- Start from the old authored document.
- Set `boundary = { points: <campus_maps boundary> }`.
- Set `terrain` from the trial `terrain` part content.
- Set `terrainTiles` from the trial tile parts (the field `splitDocument` turns into `terrain-tile:*` parts).
- Keep ids as they are (buildings, floors, roads, junctions, POIs).

### Step 3: dry run (writes nothing)

- Run Save v2's `splitDocument` on the built document. An `UnknownFieldError` or any other split error is reported with its path. The import stops there until the owner rules on it (Rule 4).
- Check that `joinParts(split)` gives back the built document (the split's own lossless guarantee).
- Write `import-data/dry-run-report.md` with:
  - counts: buildings, floors per building, roads, junctions, POIs, terrain tiles
  - the terrain grid origin before and after (must be equal)
  - the share of the boundary outside the terrain tiles
  - every unknown or dropped field (expected: none)
  - the part list that would be saved

### Step 4: import (only with `--apply`, after the owner approves the dry-run report)

- Create campus id `map-asu-ibajay-imported` (fails if it already exists; never overwrites), name "ASU Ibajay (imported)", with settings `{ campusName, schoolName, center, boundary }` copied from `campus_maps`.
- Acquire the zones the parts need, save every part in one `studio.save` call (base commit 0, message "Import old ASU Ibajay map (map-map-1-repe) with trial terrain"), then release the zones.
- Runs as the owner's existing Studio member id. It creates no new account.
- Prints the commit number and the saved part count, and checks that the parts read back with `load` match the dry run.

### Step 5: owner checks in Studio (manual)

- Open "ASU Ibajay (imported)".
- Buildings, floors, roads and places look as they did in the old Studio.
- The terrain sits under the right buildings.
- Validate: note warnings, especially unconnected entrances or rooms.
- Preview before publishing: routes connect.

Expected follow-up fixes (owner, in Studio, not part of this import):

- Re-link building entrances that Save v2 links differently.
- The "some fixes" the owner already planned.

## Error handling

- Missing source row, empty document or boundary: stop with a clear message; nothing written.
- Split error or unknown field: stop at the dry run; listed in the report.
- Campus id already exists: stop; never overwrite.
- Save returns `stale`, `zone_not_held` or any non-`ok` status: stop and print it. Because the save is a single commit, a failed save leaves no partial campus parts. An empty campus created just before a failed save is reported, so the owner can delete it in Studio.
- Database connection details come from the existing Save v2 script setup (`scripts/save-v2/db-target.mjs`) and the Next env files. No key is printed or written to the report.

## Testing

- Unit tests for the build step (Step 2): boundary set, terrain and tiles copied unchanged, ids kept, nothing else from the trial.
- A round-trip test: build, then split, then join gives back the built document, using a small fixture shaped like the old document (one building with two floors, two roads, one junction, one POI, one terrain tile).
- A test that `--apply` refuses an existing campus id.
- The real run's evidence: the dry-run report and the post-import read-back check.

## Out of scope

- Publishing the imported campus.
- Copying anything else from the trial campus, or any other old campus (test maps stay behind).
- Converting the compiled route graph (`route_nodes` 403, `route_edges` 436). Save v2 rebuilds the network at publish from roads, junctions and floors; those counts are only a reference for the Preview check.
- Changing the old database, including pausing or deleting it.
- A reusable "import campus file" feature in Studio.
