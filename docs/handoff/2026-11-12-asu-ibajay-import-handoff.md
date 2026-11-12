# Handoff 2026-11-12: ASU-IBAJAY import into Save v2, findings, and what's next

Written by Claude for Codex. Read this whole file before acting. Work in `D:\CODEme\Navi\.navi-worktrees\navi-save-v2` (branch `feat/save-v2`; nothing pushed).

## Ground rules

1. **Never press Save, Done or Publish in Studio** unless the owner asked for that exact change. Leave editors by navigating away, not with Done. Opening an editor takes edit locks; release them afterwards (see "Locks").
2. Old database **`navi-development`** (`scvgulusmutnzasmgysx`): **read only**, never write.
3. The trial campus **`map-map-5-0y27`** (also named "ASU-IBAJAY") is a test map. Don't change it.
4. **Memory:** this PC has 14 GB of RAM and Node once crashed it. Run only one dev server at a time. The local server runs with a 3 GB Node limit, and a watchdog stops it at 3 GB.
5. **Secrets:** never print, commit or copy `.env.import.local`.

## Current state

- **Local Studio is running** at `http://localhost:3001`, from this worktree.
  - It was started by `C:\Users\ADMINI~1\AppData\Local\Temp\claude\8e5ebb08636ed23f\08959897-4712-4faf-9cf6-dd65d5bde6a3\scratchpad\start-savev2-local.ps1`. That file is a temporary copy; recreate it from the "Start the local server" section below if it's gone.
  - It loads `NAVI_STUDIO_DATABASE_URL` from `.env.import.local` and sets `NAVI_STUDIO_ALLOWED_DB_REF=ztbnicoiwjghzttchqmp`, `NEXT_PUBLIC_NAVI_SAVE_V2=1`, `NAVI_SAVE_V2_PUBLIC_READ=1`, `NEXT_PUBLIC_MOCK_AUTH=true`, `NEXT_PUBLIC_SUPABASE_URL` and the public anon key, `NODE_OPTIONS=--max-old-space-size=3072` and `NODE_USE_SYSTEM_CA=1`.
  - **`NODE_USE_SYSTEM_CA=1` is required.** Without it the database connection fails with `SELF_SIGNED_CERT_IN_CHAIN`.
- **Login:** the owner uses their real account. For tests, use the "Mock auth" user **Dr. Admin** (super admin) on `/login`. Anything saved as Dr. Admin is recorded with author `mock-super-admin`.
- **The campus:** `map-asu-ibajay`, named "ASU-IBAJAY". It's the first ASU-IBAJAY card on `/studio`, with subtitle "NAVI – ASU Ibajay Campus".
  - Editor: `http://localhost:3001/studio/map-asu-ibajay/edit`
  - Preview: `/studio/map-asu-ibajay/preview?commit=<n>`
- **Head commit is 4.** The owner has rolled their browser back to save #4 and says it works well.
- **Not published.**

### Commit history (`studio.commits`, campus `map-asu-ibajay`)

| # | Author | What it did |
|---|---|---|
| 1 | owner `d56cd7c9-bd96-464f-aed2-b98851076697` | The import: 151 parts (20 buildings, 28 floors, 26 roads, 35 junctions, 32 POIs, terrain plus 8 tiles). |
| 2 | `mock-super-admin` | **Accident** (Claude pressed Done in the terrain editor). It wiped the terrain and saved Studio's load-time rebuild: the campus part got `schemaVersion 1` and `connectivitySemanticsVersion 1.0.0`, and two floors had their entrances/staircases normalised (`bldg-1-jkl7/flr-2-efmr`, `osm-bldg-888026366/flr-6-o9cm`). |
| 3 | owner | Repair, approved by the owner. Terrain and the 8 tiles restored byte-identical to commit 1; commit 2's converted campus and floors kept. |
| 4 | `e78bb5a5-5add-4d49-8cd6-6a27a3113b4a` (owner's session) | Added `building.ground = {pad:{mode:'off',blendMeters:3}, baseMode:'follow-ground'}` to 13 buildings. Tile `1_1` max 6.3 → 5 m. **No floors, rooms, doors or roads changed.** |

## Findings (verified 2026-11-12)

### A. Publishing is refused: 5 loose roads

Preview of a commit shows "Publish would be refused". The compiler's connectivity check (`packages/compiler/src/connectivity/validator.ts`, code `HALLWAY_DISCONNECTED`) found 3 groups of outdoor road points (10, 4 and 2 points) that no entrance can reach. They come from **5 untitled arterial roads** whose ends don't join the network:

| Group | Roads | Location |
|---|---|---|
| 1 (10 points) | `T-5-2vfn`, `T-1-43qo` | ≈ 11.8186, 122.1727 (east) |
| 2 (4 points) | `T-1-s0k2`, `T-30-m7ld` | ≈ 11.8179, 122.1699 |
| 3 (2 points) | `T-1-z25a` (no name) | ≈ 11.8183, 122.1717 |

Fix in Studio: join their ends to the network (a junction), or delete them. Until then, Preview's From/To route test can't be used.

### B. Validate: 193 issues at save #4 (189 errors, 3 warnings, 1 info)

- **188 × "Room door connectivity"** across 119 rooms. Every old door has `connectedToType: 'room'` but no `connectedToId` (`packages/editor/src/validation/rules/modules/room-door-connectivity.ts`). That's how the old editor stored doors. It doesn't block publishing, but each door should say what it connects to (a hallway, a room id, or outside).
- **Staircase `stair-2-9n9e`** on the Tourism Building (`bldg-1-jkl7`) ground floor: no usable hallway, not linked to floor 1, no geometry on floor 1.
- **"Navigation graph has 46 disconnected components"** (warning).
- **Missing name** on road `T-1-z25a` (info). This is the only issue with an autofix button ("Assign Untitled").
- **Display bug:** the issues panel gives duplicate React keys (Next shows "63 Issues") because two door issues in the same room get the same `issueId`. Cosmetic only.

### C. Validate's autofix can't fix A or B

There are only five autofixes, in `packages/editor/src/validation/fix/modules/`:
- `geometry.close-polygon`
- `metadata.assign-name`
- `metadata.assign-floor-level`
- `metadata.clear-road-reference`
- `metadata.clear-entrance-reference`

The two "clear" fixes **delete** links that point to missing items; they never reconnect anything. The owner saw 126 issues and broken room and road links after an autofix or recovery action in their browser. That action was **never saved**: commit 4 has no floor or road changes, and the owner has since rolled back. **Not yet known:** which action caused it (possibly "Road Recovery").

### D. The import was missing a format stamp, which caused commit 2

- The old document had `schemaVersion: 2` and **no `connectivitySemanticsVersion`**.
- When a campus without that stamp is opened, Studio's editor rebuilds the document from its route graph (`createDocument(graph)` in `packages/editor/src/context/create-editor-context.ts`, see R68 in `src/studio-v2/client/new-campus.ts`). That graph has **no terrain**, so the editor shows flat ground, and Done saves the empty terrain.
- **Importer fixed** in commit `9d76eed`: it now stamps `schemaVersion 1` and `CONNECTIVITY_CONTRACT_VERSION`, like the campus wizard does.
- **Latent Studio bug, not fixed:** any campus missing `connectivitySemanticsVersion` can lose its terrain the same way. A guard in Studio is worth adding.

### E. Terrain notes

- **Tile `1_0`** still has the trial's spike (**+200.81 m / −130.35 m**). It's visible as a tall column in Terrain 3D, and the owner should smooth it.
- About 45% of the old boundary lies outside the sculpted tiles; that ground is flat.
- The 17 floor-plan pictures were skipped on purpose (owner's choice), so Studio shows plans as "Missing". Walls, rooms and doors are present.
- The campus card shows "0 buildings", because the import didn't write `settings.stats`. Cosmetic.

## Locks

Opening a building floor or Terrain takes edit locks under the logged-in user. Check them with:

```sql
select zone_key, holder_name from studio.zone_locks where campus_id='map-asu-ibajay';
```

Release them as Dr. Admin from a page on :3001:

```js
fetch('/api/studio/v2/locks', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-navi-studio-session': crypto.randomUUID() },
  body: JSON.stringify({ campusId: 'map-asu-ibajay', forceRelease: '<zone>' }),
})
```

## Useful files

- Import code: `src/studio-v2/import/old-map/*`, `scripts/save-v2/import-old-map.ts`
- Spec and plan: `docs/superpowers/{specs,plans}/2026-11-12-navi-old-map-import-with-trial-terrain.md`
- Ledger: `.superpowers/sdd/2026-11-12-navi-old-map-import-with-trial-terrain/progress.md`
- Settings loader: `. scripts/save-v2/load-import-env.sh` (bash; prints yes/no checks only)
- Docs: `scripts/save-v2/README-import-env.md`
- Exports and one-off diagnostics (git-ignored): `scripts/save-v2/import-data/`
  - `find-disconnected3.ts`: names the roads behind `HALLWAY_DISCONNECTED`
  - `tile-diff.ts`: tile heights per version
  - `terrain-check.ts`, `repair-terrain.ts`

## Start the local server (if it isn't running)

Use one PowerShell window in the worktree. Never print the URL.

```powershell
$l = Get-Content .env.import.local | ? { $_ -match '^NAVI_STUDIO_DATABASE_URL=' } | Select -First 1
$env:NAVI_STUDIO_DATABASE_URL = ($l -replace '^NAVI_STUDIO_DATABASE_URL=','').Trim()
$env:NAVI_STUDIO_ALLOWED_DB_REF = 'ztbnicoiwjghzttchqmp'
$env:NEXT_PUBLIC_NAVI_SAVE_V2 = '1'
$env:NAVI_SAVE_V2_PUBLIC_READ = '1'
$env:NEXT_PUBLIC_MOCK_AUTH = 'true'
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://ztbnicoiwjghzttchqmp.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = '<anon key: Supabase MCP get_publishable_keys for ztbnicoiwjghzttchqmp>'
$env:NODE_OPTIONS = '--max-old-space-size=3072'
$env:NODE_USE_SYSTEM_CA = '1'
npx next dev -p 3001
```

## Suggested next steps (owner decides)

1. Fix the 5 loose roads (finding A), then run Preview on the new commit and test routes between buildings.
2. Decide how to fill in the 188 door links (finding B): by hand in Studio, or a reviewed bulk fix. Never use the "clear" autofixes.
3. Link the Tourism ground-floor staircase.
4. Smooth the spike in tile `1_0`.
5. Optional: a Studio guard so a missing `connectivitySemanticsVersion` can't drop terrain (finding D).
6. Find which browser action produced the 126-issue state (finding C) before anyone uses it again.
