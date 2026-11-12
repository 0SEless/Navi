# Old ASU Ibajay Map Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-time script that copies the old map `map-map-1-repe` (navi-development, read only) plus only the terrain of trial campus `map-map-5-0y27` into a new Save v2 campus `map-asu-ibajay-imported`, with a dry run first.

**Architecture:** Pure, tested modules under `src/studio-v2/import/old-map/` do the work (read sources, build the document, dry run, apply). A thin CLI `scripts/save-v2/import-old-map.ts` wires them to real clients. Apply goes through Save v2's own `createStudioHandlers` in-process (same validation, checksums, zones and single-commit save as Studio), with `verifyPrincipal` returning the owner.

**Tech Stack:** TypeScript, vitest 4, `pg` (Save v2 pool via `getStudioPool`), `@supabase/supabase-js` (old project, select only), `npx tsx` for the CLI.

**Spec:** `docs/superpowers/specs/2026-11-12-navi-old-map-import-with-trial-terrain.md`

## Global Constraints

- Never write to `navi-development` (`scvgulusmutnzasmgysx`). Its only client is supabase-js doing `select`.
- Never write to trial campus `map-map-5-0y27`. Read its `terrain` part and `terrain-tile:*` parts only.
- From the trial campus copy only `terrain` content and tile bytes, unchanged.
- Target campus id `map-asu-ibajay-imported`, name `ASU Ibajay (imported)`. Never overwrite: a `409 CAMPUS_EXISTS` stops the run.
- One save, base commit 0, message `Import old ASU Ibajay map (map-map-1-repe) with trial terrain`.
- Do not publish.
- Unknown or unplaceable fields stop the run and are listed; nothing is dropped.
- Save v2 connection: `NAVI_STUDIO_DATABASE_URL` plus `NAVI_STUDIO_ALLOWED_DB_REF=ztbnicoiwjghzttchqmp` (required by `assertStudioDatabaseTarget`). Old project: `NAVI_OLD_SUPABASE_URL` and `NAVI_OLD_SUPABASE_SERVICE_KEY`. No secret is printed or written to a file.
- Export files live in `scripts/save-v2/import-data/`, which is git-ignored.

## Review Focus

1. **Old boundary stored as a closed ring** (last point repeats the first): build must keep it as-is; Studio's `openRing` handles it. Test in Task 2.
2. **A tile part whose bytes are not exactly `TILE_BYTES`**: dry run must stop with the tile id, not save a broken tile. Test in Task 3.
3. **Re-running `apply` after a successful import**: must stop at `CAMPUS_EXISTS` and change nothing. Test in Task 4.
4. **Save returns a non-ok status after the campus was created** (`stale`, `zone_not_held`, a 4xx): the run reports the empty campus id so the owner can delete it, and still releases zones. Test in Task 4.
5. **`--apply` without a dry-run report for the same export**: refuse. The report stores a hash of the two export files; apply recomputes and compares. Test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/studio-v2/import/old-map/types.ts` | `OldMapExport`, `TrialTerrainExport`, `DryRunReport` types |
| `src/studio-v2/import/old-map/read-sources.ts` | Read old map (supabase-js) and trial terrain (pg) into the export types |
| `src/studio-v2/import/old-map/build-document.ts` | Combine the two exports into one `CampusDocument` |
| `src/studio-v2/import/old-map/dry-run.ts` | Split, round-trip, counts, checks, Markdown report |
| `src/studio-v2/import/old-map/apply.ts` | Create campus, acquire zones, save, release, read back, via Studio handlers |
| `src/studio-v2/import/old-map/__tests__/*.test.ts` | Tests, one file per module, plus `fixture.ts` |
| `scripts/save-v2/import-old-map.ts` | CLI: `export`, `dry-run`, `apply` |
| `.gitignore` | Add `scripts/save-v2/import-data/` |
| spec | Correct the connection line (see Task 1) |

---

### Task 1: Types, fixture, ignore rule, spec fix

**Files:**
- Create: `src/studio-v2/import/old-map/types.ts`, `src/studio-v2/import/old-map/__tests__/fixture.ts`
- Modify: `.gitignore`, `docs/superpowers/specs/2026-11-12-navi-old-map-import-with-trial-terrain.md` (Error handling, last bullet)

**Interfaces:**
- Produces:
  - `interface OldMapExport { campusId: string; name: string; schoolName: string | null; center: { lat: number; lng: number }; boundary: Array<{ lat: number; lng: number }>; document: Record<string, unknown> }`
  - `interface TrialTerrainExport { campusId: string; terrain: Record<string, unknown>; tiles: Array<{ tileId: string; contentBase64: string }> }`
  - `interface DryRunReport { ok: boolean; problems: string[]; counts: { buildings: number; floors: Record<string, number>; roads: number; junctions: number; pois: number; terrainTiles: number }; originBefore: { originLat: number; originLng: number }; originAfter: { originLat: number; originLng: number } | null; boundaryOutsideTiles: number; partKeys: string[]; exportHash: string }`
  - `fixture.ts` exports `oldMapFixture(): OldMapExport` (one building with id `b-1` and two floors, two roads, one junction, one POI; a closed boundary of 5 points where the last repeats the first, with exactly 3 of the 5 inside tile `0_0` of the trial grid, i.e. within 128 m east and north of the origin) and `trialTerrainFixture(): TrialTerrainExport` (terrain with grid origin 11.8170997658108 / 122.16843523135711, one tile `0_0` of `TILE_BYTES` zero bytes).

- [ ] **Step 1:** Add `scripts/save-v2/import-data/` to `.gitignore`. Check: `git check-ignore scripts/save-v2/import-data/x.json` prints the path.
- [ ] **Step 2:** In the spec's Error handling, replace the `db-target.mjs` bullet with: "Save v2 is reached with `getStudioPool()` (`NAVI_STUDIO_DATABASE_URL`, `NAVI_STUDIO_ALLOWED_DB_REF=ztbnicoiwjghzttchqmp`); that pool refuses the protected Development project by design, so the old map is read with a separate supabase-js client doing `select` only. No key is printed or written to the report."
- [ ] **Step 3:** Write `types.ts` and `fixture.ts` as above. Build the fixture document by hand, shaped like the real old document (fields seen 2026-11-12: road keys `id,name,type,width,routing,surface,metadata,polyline,displayMode`; junction keys `id,source,roadIds,position`).
- [ ] **Step 4:** `npx tsc --noEmit -p .` shows no errors in `src/studio-v2/import/`.
- [ ] **Step 5:** Commit `chore(import): types, fixture and ignore rule for old-map import`.

### Task 2: Build the import document

**Files:**
- Create: `src/studio-v2/import/old-map/build-document.ts`
- Test: `src/studio-v2/import/old-map/__tests__/build-document.test.ts`

**Interfaces:**
- Consumes: Task 1 types and fixture.
- Produces: `buildImportDocument(old: OldMapExport, trial: TrialTerrainExport): CampusDocument`

- [ ] **Step 1: Write the failing tests**

```ts
it('sets the boundary from the old campus map, unchanged (closed ring kept)', () => {
  const old = oldMapFixture()
  const doc = buildImportDocument(old, trialTerrainFixture())
  expect(doc.boundary).toEqual({ points: old.boundary })
})
it('copies the trial terrain and tiles unchanged', () => {
  const trial = trialTerrainFixture()
  const doc = buildImportDocument(oldMapFixture(), trial) as Record<string, unknown>
  expect(doc.terrain).toEqual(trial.terrain.terrain)
  expect(doc.terrainTiles).toEqual({ '0_0': trial.tiles[0].contentBase64 })
})
it('keeps every old id and takes nothing else from the trial campus', () => {
  const old = oldMapFixture()
  const doc = buildImportDocument(old, trialTerrainFixture())
  expect(doc.buildings.map((b) => b.id)).toEqual((old.document.buildings as Array<{ id: string }>).map((b) => b.id))
  expect(doc.roads).toEqual(old.document.roads)
  expect(doc.roadJunctions).toEqual(old.document.roadJunctions)
  expect(doc.pois).toEqual(old.document.pois)
})
it('does not mutate its inputs', () => {
  const old = oldMapFixture(); const before = structuredClone(old)
  buildImportDocument(old, trialTerrainFixture())
  expect(old).toEqual(before)
})
```

- [ ] **Step 2:** `npx vitest run src/studio-v2/import/old-map/__tests__/build-document.test.ts` fails (module missing).
- [ ] **Step 3:** Implement: deep-clone `old.document`, set `boundary`, set `terrain` from `trial.terrain.terrain` and any `terrainAreas` / `terrainVerticalDatum` present in `trial.terrain`, and set `terrainTiles` as `{ [tileId]: contentBase64 }`.
- [ ] **Step 4:** The same command passes.
- [ ] **Step 5:** Commit `feat(import): build the combined import document`.

### Task 3: Dry run and report

**Files:**
- Create: `src/studio-v2/import/old-map/dry-run.ts`
- Test: `src/studio-v2/import/old-map/__tests__/dry-run.test.ts`

**Interfaces:**
- Consumes: `buildImportDocument`; `splitDocument`, `UnknownFieldError` (`@/studio-v2/parts/split`); `joinParts` (`@/studio-v2/parts/join`); `TILE_BYTES`, `TILE_CELLS`, `toLocal`, `tileOfCell` (`@navi/core`).
- Produces: `dryRun(old: OldMapExport, trial: TrialTerrainExport, exportHash: string): { report: DryRunReport; parts: PartRecord[] }` and `renderReport(report: DryRunReport): string`

- [ ] **Step 1: Write the failing tests**

```ts
it('passes the fixture with exact counts and an unchanged terrain origin', () => {
  const { report } = dryRun(oldMapFixture(), trialTerrainFixture(), 'h')
  expect(report.ok).toBe(true)
  expect(report.counts).toEqual({ buildings: 1, floors: { 'b-1': 2 }, roads: 2, junctions: 1, pois: 1, terrainTiles: 1 })
  expect(report.originAfter).toEqual(report.originBefore)
})
it('round-trips: joinParts(split) equals the built document', () => { /* compare via canonicalJson, ignoring the fields join.ts documents */ })
it('stops on an unknown top-level field and names it', () => {
  const old = oldMapFixture(); (old.document as Record<string, unknown>).legacyThing = 1
  const { report } = dryRun(old, trialTerrainFixture(), 'h')
  expect(report.ok).toBe(false)
  expect(report.problems.join('\n')).toContain('legacyThing')
})
it('stops on a tile with the wrong byte length and names the tile', () => {
  const trial = trialTerrainFixture(); trial.tiles[0].contentBase64 = 'AAAA'
  const { report } = dryRun(oldMapFixture(), trial, 'h')
  expect(report.ok).toBe(false)
  expect(report.problems.join('\n')).toContain('0_0')
})
it('reports the share of boundary points outside the copied tiles', () => {
  // fixture boundary: 3 of 5 points inside tile 0_0
  expect(dryRun(oldMapFixture(), trialTerrainFixture(), 'h').report.boundaryOutsideTiles).toBeCloseTo(0.4)
})
it('renders a report that lists counts, origin, problems and the export hash', () => { /* renderReport contains each heading and 'h' */ })
```

- [ ] **Step 2:** Run the file; it fails.
- [ ] **Step 3:** Implement. Catch split errors into `problems` (with the error message, which carries the field path). Decode each tile's base64 and check the length equals `TILE_BYTES`. Boundary share: for each boundary point, `toLocal(grid, p)` → cell `floor(x)`, `floor(y)` (cellMeters 1) → `tileOfCell` → its id; count ids not in the copied tiles. Floors per building come from the building's floors in the old document.
- [ ] **Step 4:** Run the file; it passes.
- [ ] **Step 5:** Commit `feat(import): dry run with report`.

### Task 4: Apply through Studio handlers

**Files:**
- Create: `src/studio-v2/import/old-map/apply.ts`
- Test: `src/studio-v2/import/old-map/__tests__/apply.test.ts`

**Interfaces:**
- Consumes: `createStudioHandlers`, `StudioHandlerDeps` (`@/studio-v2/server/handlers`); `zoneOf` (`@/studio-v2/parts/part-keys`); `STUDIO_SESSION_HEADER` (`@/studio-v2/parts/limits`); Task 3 `parts`.
- Produces: `applyImport(input: { handlers: ReturnType<typeof createStudioHandlers>; campusId: string; name: string; settings: Record<string, unknown>; parts: PartRecord[]; message: string }): Promise<{ ok: true; commit: number; savedParts: number } | { ok: false; stage: 'create' | 'locks' | 'save' | 'readback'; status: number; body: unknown; createdEmptyCampus: boolean }>`

Request shapes, as the handlers expect them:
- create: `POST` body `{ campusId, name, settings }`
- locks: header `x-navi-studio-session: <uuid>`, body `{ campusId, acquire: zones }` and later `{ campusId, release: zones }`
- save: same session header, body `{ campusId, mutationId: <uuid>, baseCommit: 0, message, changes }`, where each change is `{ partKey, expectedVersion: 0, op: 'put', content, sortKey }`, or `{ partKey, expectedVersion: 0, op: 'put-bin', contentBase64 }` for terrain tiles
- readback: `load(request, { id: campusId })`

Zones: the unique non-null `zoneOf(part.key)` values.

- [ ] **Step 1: Write the failing tests** with an in-memory fake `StudioRepo` passed to the real `createStudioHandlers`, and `verifyPrincipal` returning `{ ok: true, principal: { id: 'owner-1', email: null, role: 'owner', method: 'script' } }`:

```ts
it('creates the campus, saves all parts in one save, releases zones, and reads back the same keys', async () => {
  const result = await applyImport({ handlers, campusId: 'map-asu-ibajay-imported', name: 'ASU Ibajay (imported)', settings, parts, message })
  expect(result).toMatchObject({ ok: true, savedParts: parts.length })
  expect(fakeRepo.saveCalls).toHaveLength(1)
  expect(fakeRepo.saveCalls[0].baseCommit).toBe(0)
  expect(fakeRepo.heldZones()).toEqual([])
})
it('stops at CAMPUS_EXISTS and calls nothing else', async () => {
  fakeRepo.seedCampus('map-asu-ibajay-imported')
  const result = await applyImport({ ...input })
  expect(result).toMatchObject({ ok: false, stage: 'create', status: 409, createdEmptyCampus: false })
  expect(fakeRepo.saveCalls).toHaveLength(0)
})
it('reports the empty campus and still releases zones when save fails', async () => {
  fakeRepo.failNextSave({ status: 'stale' })
  const result = await applyImport({ ...input })
  expect(result).toMatchObject({ ok: false, stage: 'save', createdEmptyCampus: true })
  expect(fakeRepo.heldZones()).toEqual([])
})
it('sends terrain tiles as put-bin and everything else as put', async () => { /* inspect saveCalls[0].changes ops by key prefix */ })
```

- [ ] **Step 2:** Run the file; it fails.
- [ ] **Step 3:** Implement. Build `Request` objects with `new Request('http://local/import', { method: 'POST', headers, body: JSON.stringify(...) })`. Use one `crypto.randomUUID()` for the session and one for the mutation id. Release zones in a `finally`.
- [ ] **Step 4:** Run the file; it passes.
- [ ] **Step 5:** Commit `feat(import): apply through Studio handlers`.

### Task 5: Read sources and the CLI

**Files:**
- Create: `src/studio-v2/import/old-map/read-sources.ts`, `scripts/save-v2/import-old-map.ts`
- Test: `src/studio-v2/import/old-map/__tests__/read-sources.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `getStudioPool`, `createStudioRepo`; `createClient` from `@supabase/supabase-js`.
- Produces:
  - `readOldMap(client: { from(table: string): any }, campusId: string): Promise<OldMapExport>`. Selects `graph_snapshots.authored_document` and `campus_maps.data` (`name`, `schoolName`, `center`, `boundary`) for `campusId`. It uses only `.select`.
  - `readTrialTerrain(db: StudioQueryable, campusId: string): Promise<TrialTerrainExport>`. One SELECT joining `studio.parts_current` to `studio.part_versions` on `campus_id`, `part_key` and `version_no`, where `part_key = 'terrain' OR part_key LIKE 'terrain-tile:%'`, `deleted = false`. `content_bin` becomes base64, and the tile id is the key after `terrain-tile:`.
  - `exportHash(oldJson: string, trialJson: string): Promise<string>`: `sha256Hex` of `oldJson + '\n' + trialJson`.
  - CLI commands, run as `npx tsx scripts/save-v2/import-old-map.ts <cmd>`:
    - `export` writes `import-data/old-map.json` and `import-data/trial-terrain.json`
    - `dry-run` reads both, writes `import-data/dry-run-report.md` and `import-data/dry-run-report.json`, and exits 1 when `!ok`
    - `apply --actor <owner user id> --actor-name <name>` refuses unless `dry-run-report.json` exists, has `ok: true`, and its `exportHash` equals the hash of the current export files. It then runs `applyImport` and prints the commit number and part count.

- [ ] **Step 1: Write the failing tests:**
  - `readOldMap` with a fake client: it returns the export, and the fake records that only `select` and `eq` were called
  - `readOldMap` throws `"No authored document for map-map-1-repe"` when the row is missing
  - `readTrialTerrain` with a fake `query`: it maps rows to `terrain` and tiles, and the SQL text contains no `insert`, `update` or `delete`
  - `exportHash` is stable for the same input and changes when one byte changes
- [ ] **Step 2:** Run the file; it fails.
- [ ] **Step 3:** Implement the readers and the CLI. The CLI never logs env values. On `apply`, the actor comes from the flag, which is the owner's `studio.members.user_id`. The dry-run report prints the owner row of `map-map-5-0y27` to help pick it.
- [ ] **Step 4:** Run the file; it passes. Then run the whole folder: `npx vitest run src/studio-v2/import/old-map`. Expect all files to pass.
- [ ] **Step 5:** Commit `feat(import): source readers and CLI`.

### Task 6: Real export and dry run (stop for the owner)

Not code: this runs the tool against the real projects, read only.

- [ ] **Step 1:** Set the four env vars in the shell; never paste them into files. Run `npx tsx scripts/save-v2/import-old-map.ts export`. Expect two files in `import-data/`.
- [ ] **Step 2:** Run `npx tsx scripts/save-v2/import-old-map.ts dry-run`. Expected counts: 20 buildings, 26 roads, 35 junctions, 32 POIs, 8 terrain tiles, and the origin unchanged. If `ok` is false, bring each problem to the owner. Do not change the old data.
- [ ] **Step 3:** Show the owner `dry-run-report.md`. **Stop here until the owner approves the report.**

### Task 7: Apply and check (after owner approval)

- [ ] **Step 1:** Run `npx tsx scripts/save-v2/import-old-map.ts apply --actor <owner id> --actor-name "<owner name>"`. Expect `ok`, with a commit number and a part count equal to the dry run's `partKeys.length`.
- [ ] **Step 2:** Read-only SQL on `ztbnicoiwjghzttchqmp`: `select count(*) from studio.parts_current where campus_id='map-asu-ibajay-imported'` equals the part count. Then run the same query for `map-map-5-0y27` and confirm it is unchanged at 69 (checked 2026-11-12).
- [ ] **Step 3:** Hand over to the owner for the Studio checks in spec Step 5: look, Validate, terrain under buildings, Preview before publishing. Record the findings in `progress/PROGRESS.md`.
