# NAVI 360 — Live Publish Acceptance Gate (2026-09-25)

## Verdict

**PASS** — with disclosed hybrid input (user-approved) and disclosed fixture
limitations. All required stages executed end-to-end with runtime evidence:
source campus data → `POST /api/compile` → `POST /api/publish` →
`published_maps` + `demo-output` → `GET /api/public-campus` → `/map/panoramas`
viewer (browser) and package path `build()` → `load()`.

## Constraints honored

- Phase 3 not started; no refactors; bugs found were documented, not fixed.
- The six Phase 2 files were NOT modified (status clean; HEAD `048fb6b`).
- No stash/reset/clean/commit/push; no production mutation.
  Final `navi-next` status: **110 M / 346 ?? / 2 D = recorded baseline**.
- Dev runtime used `NEXT_PUBLIC_MOCK_AUTH=true` + mock-super-admin cookie on
  `localhost:3000` (PID 15844), Supabase ref `scvgulusmutnzasmgysx`
  (`.env.development.local`, non-production). Production ref only read from
  `.env.production.local`, never called. No secrets printed.

## Input disclosure (user-approved hybrid)

- The only fixture containing real hotspot `hotspotType`/`content` data
  (`campus-backup-fixture`, `buildCampusDocument()` in
  `src/services/campus-backup/__tests__/fixture.ts`) fails native
  `compileV2` with `HALLWAY_DISCONNECTED ×2` — it is round-trip-only
  topology that was never a compile-ready closure. Exhaustive search (repo
  JSON/TS + dev DB) found no other dataset with those hotspot fields.
- **Approved approach:** w15f compile-ready document structure (from
  `packages/compiler/src/__tests__/w15f-publish-e2e-closure-gate.test.ts`
  factories: building `b1`, floor `fl-0`, entrance, nodes N-102/N-103, edge
  E-104) + the fixture's `panoramas` array **VERBATIM** (no fabricated
  hotspot data, no new schema). `metadata.campusId = campus-backup-fixture`,
  `version: 1`.
- Quirks of the hybrid (disclosed, tolerated by compile): panorama
  `buildingId: 'bldg-alpha'` is not among the hybrid's buildings; emitted
  panorama `position` is derived `{lat: 0, lng: 0}`.

## Stage evidence

| Stage | Result | Evidence |
|---|---|---|
| Compile `POST /api/compile` | 200, `status=success`; `panoramaIndex` emits **both** hotspots with `hotspotType` + `content` intact; graph 2 nodes/1 edge; 1 warning | `live-publish-gate/compile-response.json` |
| Publish `POST /api/publish` | 200, `success=true supabase=written`; manifest `revision=1 campusId=campus-backup-fixture`; manifest artifact keys **`buildings` (plural)** + `panorama` checksum; counts `{nodes:2,edges:1}` | `live-publish-gate/publish-response.json` |
| `demo-output/` | Post-publish: 11 files rewritten (by design), `panorama-index.json` 951 B with both hotspots verbatim. Restored to pre-publish state after evidence capture; restore hash-verified **11/11 match**, no extra files. Both states reported here. | `live-publish-gate/demo-output-pre-publish/` |
| Dev DB evidence | `published_maps` row `campus-backup-fixture` revision 1 **left in place** (non-prod) as evidence | live table |
| Public read `GET /api/public-campus` | 200, **`source=published_maps`, `revision=1`** (Stage 1 baseline was `source=empty`); `artifacts.panoramaIndex` serves both hotspots | `live-publish-gate/public-campus-response.json` |
| Package path `build()` → `load()` | `pkg.schemaVersions.buildings = "1.0.0"`; `pkg.buildings` present; build output preserves both hotspots; runtime loader returns hotspots with `hotspotType` + `content` identical — **round trip OK**. Temp vitest file deleted after run. | temp test output (transcript) |
| Browser viewer `/map/panoramas` | Fresh context, `localStorage['navi-default-campus']='campus-backup-fixture'`: header "360° Virtual Tour" / "1 panoramas available"; pannellum container live; **2 hotspots in DOM (1 scene + 1 info)**; info-hotspot click → `InformationCard` shows **"About this building" / "Fixture hotspot"**; network: `public-campus` 200 with `source=published_maps` body, `/map/asset-pano-lobby` 200; **0 console errors** | `live-publish-gate/gate-01-viewer-hotspots.png`, `gate-02-information-card.png` |

Evidence directory (outside the worktree):
`C:\Users\Administrator\AppData\Local\Temp\opencode\live-publish-gate\`
(fixture + hybrid JSON, all HTTP response bodies, pre-publish backup,
export/chain scripts, screenshots).

## Risk A–D disposition

- **A — `?? null` optional-artifact convention:** publish route emits
  4-byte `null` for absent optional artifacts; runtime readers tolerate it
  (`getAvailablePanoramas` `?? []`; read validation runs with
  `requireProvenance:false`). Pre-publish `demo-output` demonstrated the
  convention live. Explicit regression test remains deferred (Phase 3+).
- **B — package path round trip:** PASS (see table). `hotspotType` and
  `content` survive `build()` → package files → `load()`.
- **C — `buildings` plural contract:** PASS. API manifest key `buildings`,
  `pkg.schemaVersions.buildings`, and loader binding `buildings` all plural;
  the singular `PublishOptions.schemaVersions.building` input field is
  intentional and unchanged. Bonus: `buildingIndex` artifact observed in the
  public response.
- **D — browser-level freshness:** PASS. Fresh browser context (no cache),
  `empty → published_maps` transition vs Stage 1 baseline, response body
  verified in-browser.

## Disclosures and observations (documented, not fixed — gate boundary)

1. Hybrid input above (user-approved).
2. Fixture limitations: single panorama; navigation hotspot targets entrance
   `ent-main` (not a panorama) so scene-to-scene navigation is not
   exercisable with this data; `imageAssetId 'asset-pano-lobby'` was served
   by a **temporary** placeholder image created only for the gate and
   deleted afterward (`public/map/` did not exist before).
3. Dev `published_maps` row for `campus-backup-fixture` left in the
   non-production database as evidence.
4. Pre-existing schema drift: `GET /api/campuses` 500s because the dev
   `graph_snapshots` table lacks the `authored_document` column — observed,
   not fixed.
5. Known deferred items remain deferred: `round-trip-verifier.ts:58`
   `parsed['building']`, explicit `?? null` contract test, R2, graphify
   rebuild, stale lint baselines, smoke script `pkg.building` (line 111),
   Cloudinary credentials.

## Cleanup performed

- Temp tests `tmp-acceptance-fixture-export.test.ts`,
  `tmp-acceptance-feasibility.test.ts`, `tmp-acceptance-package-path.test.ts`
  — all deleted (verified none remain untracked).
- Temporary panorama asset `public/map/asset-pano-lobby` + its directory
  deleted (directory proven mine: contained only that file).
- `demo-output/` restored from pre-publish backup (hash-verified).
- Gate screenshots moved out of the worktree to the evidence directory.
- Final worktree verification vs baseline: **110 M / 346 ?? / 2 D — match**;
  `HEAD 048fb6b`; Phase 2 six files clean.

## LIVE PUBLISH ACCEPTANCE RESULT

- **Status:** PASS
- **Chain:** compile ✅ → publish ✅ (supabase written, demo-output rewritten
  then restored) → published_maps ✅ (dev row left as evidence) →
  public-campus ✅ (`source=published_maps`, revision 1, hotspots intact) →
  viewer ✅ (2 hotspots, InformationCard content, 0 console errors) →
  package path ✅ (`build()`→`load()` preserves `hotspotType`/`content`,
  `schemaVersions.buildings` plural)
- **Risks:** A tolerated-by-design (test deferred) · B PASS · C PASS · D PASS
- **Disclosures:** user-approved hybrid input (w15f closure + fixture
  panoramas verbatim); single-panorama fixture, non-exercisable scene-to-scene
  nav, temporary placeholder image; dev `published_maps` row kept as evidence;
  pre-existing `/api/campuses` schema drift noted, not fixed.
- **Worktree:** baseline match (110 M / 346 ?? / 2 D), Phase 2 files clean,
  no commits, no production mutation, no Phase 3 work.
