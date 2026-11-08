# Indoor stairs and lifts connect floor to floor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stairs and lifts drawn on each floor connect to the one directly below/above (automatically when placed, changeable in the panel), so routes reach upper floors.

**Architecture:** Each stair/lift keeps `links: { below?, above? }` (feature ids, adjacent floors, same kind, always both ways). Pure helpers in `@navi/editor` keep links consistent; commands use them (link/unlink new, create/delete updated). The compiler treats a linked chain as one connector, so its existing floor-to-floor pairing joins them. A floor-editor panel shows and edits the links.

**Tech Stack:** TypeScript, React 19 / Next 16, vitest, Playwright (Save v2 lane).

**Spec:** `docs/superpowers/specs/2026-11-08-navi-floor-stair-links.md`

## Global Constraints

- Adjacent floors only; same kind only (stair ↔ stair, lift ↔ lift); links always both ways.
- New stairs/lifts: `fromLevel = toLevel = floor`. Old multi-level stairs/lifts unchanged and still routed.
- Auto-connect on placing: down to the nearest floor N−1 same-kind item with no `above`; up to the nearest floor N+1
  item with no `below` (building metres between their level positions).
- Copy (exact): "Connects down to", "Connects up to", "— not connected —", "No floor below", "No floor above",
  "Disconnect", Validate warning `Stair "<name>" on <floor label> isn't connected to another floor` (`Lift …` for lifts).
- Undo: every link change is one undo step (link/unlink use the editor's snapshot undo: `inverse()` returns `null`).
- No server or database change; Dev Supabase untouched; nothing to production; push only when the owner says.
- Gates before every commit: `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` (regressed 0;
  tsc = baseline, clean folders 0), then `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__`.
  Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No subagents (owner rule).

## Review Focus

1. Restoring a deleted stair (undo) brings back its links **and** its partners' reciprocal links, without auto-linking
   anything else.
2. Linking to a stair that already has a partner on that side moves the link; the old partner is left unlinked, never
   pointing at two stairs.
3. A floor deleted or renumbered under linked stairs → links to a stair that is no longer on an adjacent floor are
   ignored by the compiler and reported by Validate (no crash).
4. Mixed kinds: a lift is never offered for, or auto-linked to, a stair.
5. A chain mixing an old multi-level stair with new single-floor stairs still pairs floor by floor.

---

### Task 1: Link data and pure helpers

**Files:**
- Modify: `packages/core/src/types/entities.ts` (`Staircase`, `Elevator`: `links?: { below?: string; above?: string }`)
- Create: `packages/editor/src/navigation/feature-links.ts`, `packages/editor/src/navigation/__tests__/feature-links.test.ts`

**Interfaces — Produces:**
```ts
type FeatureKind = 'staircase' | 'elevator'
function featureFloor(feature: Staircase | Elevator): number            // the single level a new item is on (lowest key of levels)
function linkFeatures(building: Building, kind: FeatureKind, lowerId: string, upperId: string): { ok: true } | { ok: false; error: string }
function unlinkFeature(building: Building, kind: FeatureKind, id: string, side: 'below' | 'above'): void
function clearFeatureLinks(building: Building, kind: FeatureKind, id: string): void
function autoLinkFeature(building: Building, kind: FeatureKind, id: string): void
function linkCandidates(building: Building, kind: FeatureKind, id: string, side: 'below' | 'above'): Array<Staircase | Elevator>
```
`linkFeatures` refuses non-adjacent floors, other kinds or unknown ids; clears any existing partner on both affected sides
first (move semantics).

- [ ] **Step 1 (RED):** tests `link sets both sides`, `linking to a stair that has a partner moves the link`, `refuses
  a floor two apart`, `refuses a lift for a stair`, `unlink clears both sides`, `clear removes links from partners`,
  `auto-link connects down to the nearest free stair below`, `auto-link connects up when the floor above has a free
  stair`, `auto-link connects nothing for the first stair`, `candidates list only the adjacent floor's same-kind items`.
- [ ] **Step 2:** run `npx vitest run packages/editor/src/navigation/__tests__/feature-links.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3:** implement. **Step 4:** run — Expected: PASS; gates.
- [ ] **Step 5:** commit `feat(editor): stairs and lifts link to the floor above and below`.

### Task 2: Commands (place, link, unlink, delete)

**Files:**
- Create: `packages/editor/src/commands/feature-link-handlers.ts` (`feature.link` `{ buildingId, featureType, lowerId, upperId }`, `feature.unlink` `{ buildingId, featureType, featureId, side }`, both `inverse() → null`); register them where `featureCreateHandler` is registered (`packages/editor/src/context/create-editor-context.ts`) and export from `packages/editor/src/commands/index.ts`
- Modify: `packages/editor/src/commands/feature-handlers.ts` — `feature.create`: default `toLevel = floor`; when the payload carries `links` (undo of a delete) restore them and the partners' reciprocal links, else `autoLinkFeature`; `feature.delete`: `clearFeatureLinks` before removing
- Modify: `src/components/floor-editor/useFloorDrawing.ts` (3 places) and `src/components/floor-editor/floor-rectangle-authoring.ts`: `toLevel: floor`
- Test: `packages/editor/src/commands/__tests__/feature-links-commands.test.ts`

**Interfaces — Consumes:** Task 1 helpers.

- [ ] **Step 1 (RED):** tests `placing a stair on 2F auto-links it to the 1F stair (one undo step removes both)`,
  `feature.link / feature.unlink change both sides and undo exactly`, `deleting a linked stair clears its partner; undo
  restores both links and links nothing else`, `a new stair spans only its own floor`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(editor): placing a stair connects it; link, unlink and delete keep links both ways`.

### Task 3: Compiler — a linked chain is one connector

**Files:**
- Modify: `packages/compiler/src/primitives/connector-extractor.ts` — for building staircases/elevators, the stop's
  `connectorId` is the chain's root id (follow `links.below` to the bottom; ignore a link whose partner is missing, of
  another kind or not on the adjacent floor); existing pairing in `connector.ts` then joins consecutive floors
- Test: `packages/compiler/src/__tests__/feature-link-chain.test.ts`; rewrite `src/studio-v2/route-network-floors.e2e.test.ts` to the new model

- [ ] **Step 1 (RED):** compiler tests `three single-floor stairs linked 1F↔2F↔3F give stairs edges 1F–2F and 2F–3F`,
  `an unlinked single-floor stair gives no floor edge`, `a link to a missing or non-adjacent stair is ignored`,
  `an old multi-level stair still pairs`; e2e `stairs placed on 1F, 2F, 3F with the floor editor's commands: road →
  door → 1F → stairs → 2F → 3F → Office 301`, and the same with lifts (step type 'elevator').
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(compiler): linked stairs and lifts join their floors`.

### Task 4: Validate — unconnected stair or lift

**Files:** Modify `packages/editor/src/validation/rules/modules/feature-rules.ts` (new rule `feature-unconnected`,
severity warning, registered with the feature rules); test `packages/editor/src/validation/__tests__/feature-unconnected.test.ts`

- [ ] **Step 1 (RED):** `warns for an unlinked single-floor stair in a two-floor building`, `no warning when linked`,
  `no warning in a one-floor building`, `no warning for an old multi-level stair`, `lift wording`.
- [ ] **Steps 2–4:** fail → implement → pass; gates. **Step 5:** commit `feat(editor): Validate warns about stairs and lifts that connect no floor`.

### Task 5: Floor-editor panel

**Files:**
- Create: `src/components/floor-editor/FeatureLinks.tsx` (props `{ building, featureType, featureId, floors, dispatch }`), `src/components/floor-editor/__tests__/FeatureLinks.test.tsx`
- Modify: `src/components/floor-editor/ComponentProperties.tsx` — for stairs/lifts render `FeatureLinks` instead of the
  floor-range inputs (keep the rest of the save flow; drop `fromLevel/toLevel` from its `feature.update` patch)

- [ ] **Step 1 (RED):** `shows Connects down to 1F · Stair A and Connects up to — not connected —`, `the dropdown lists
  only the adjacent floor's stairs`, `choosing one dispatches feature.link`, `Disconnect dispatches feature.unlink`,
  `No floor above on the top floor`, `a lift lists lifts only`.
- [ ] **Steps 2–4:** fail → implement → pass; gates. **Step 5:** commit `feat(studio): connect stairs and lifts between floors in the floor editor`.

### Task 6: Browser lane and preview

**Files:** `e2e/save-v2/parity.spec.ts` (new `P13`)

- [ ] **Step 1:** P13 — on the publishable campus, place a stair on the ground floor and one on the upper floor in the
  floor editor; the upper stair's panel shows "Connects down to …"; Save; Preview's route from a ground-floor place to
  an upper-floor place passes the stairs (check the visitor graph via the preview response, as T15 does).
- [ ] **Step 2:** `node e2e/save-v2/run.mjs -g "P13"` → PASS; full lane in the background → all pass (T14 skipped).
- [ ] **Step 3:** gates; commit `test(studio): stairs connect floors in the browser`.
- [ ] **Step 4:** `bash scripts/save-v2/deploy-preview.sh`; owner tests; push only on the owner's word.
