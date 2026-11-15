# Buildings meet the hill: banks and plinths — design

Owner approved the approach 2026-11-15 ("Banks and plinths"). Status: design, waiting for owner approval.

## Why

On the ASU hillside the ground "warps" beside buildings. Today's rule (packages/core/src/terrain/compose.ts):

1. Follow-the-ground floor height = average ground under the outline, so one side is buried and the other floats.
2. Ground inside the outline goes to that floor height (owner rule: no ground inside any building, keep).
3. Pad Off: a flat 2.5 m shelf at floor height all round, then a vertical jump back to the hill.
4. Pad on with Blend 0: the same jump at the walls.

Result: every hillside building sits on a ledge with a cliff around it, metres high on one side, and the cliff
cuts into roads beside it. Goal: buildings look set into the hill, the way real hillside buildings are.

## Approaches considered

- **A. Banks and plinths (chosen).** Uphill: ground cut back as a sloped bank. Downhill: ground left alone; the
  building shows a plinth (base wall) down to the ground. Least change to the hill, most natural.
- B. Slopes all round: cut uphill, fill downhill with the same slope. Simpler, but buildings sit on artificial
  mounds that spread far on steep ground.
- C. Keep the shelf, draw retaining walls on the cliffs. Hides the problem, keeps the cliffs; rejected.

## Design

**Floor height:** unchanged (Fixed, or Follow the ground = average under the outline).

**Inside the outline:** unchanged — ground at floor height (no ground inside any building).

**Uphill side (ground higher than the floor) — bank:**
- A level walkway of 1 m at floor height right outside the walls.
- Beyond it the ground rises at most at the bank slope until it meets the hill:
  height = min(hill, floor + slope × (distance − 1 m)).
- The bank's width is automatic: a 4 m rise at 1 in 2 gives an 8 m bank; a small rise gives a small bank.
- Bank slope setting per building: Gentle (1 in 3), Normal (1 in 2, default), Steep (1 in 1).

**Downhill side (ground lower than the floor) — plinth:**
- The ground is not filled. The building's base wall (plinth) is drawn from the floor down to the ground along
  each wall, in Studio's 3D view and on NAVI Web, in a darker shade than the walls so it reads as a foundation.
- No gap between building and ground on any side.

**Roads:** a graded road still wins on its own surface (2026-11-15 rule). An ungraded road crossing a bank
follows the bank (no cliff to cut into it any more).

**Settings panel ("Ground around"):** replaces Pad mode + Blend with:
- Ground around: Bank and plinth (default) · Slopes all round (cut and fill at the bank slope) · Leave the hill
  as it is (only the outline is dug/filled).
- Bank slope: Gentle · Normal · Steep.

**Saved campuses (no DB migration):** existing `ground.pad` values are read as: Off / missing → Bank and plinth;
Raise only → bank, no fill (same as Bank and plinth); Lower only / Raise and lower → Slopes all round. Blend is no
longer used for shape. New saves write the new setting alongside. Nothing is written until the owner presses Done.

## Not in scope

Changing how Follow-the-ground picks the floor height; stepped (split-level) floors; retaining-wall textures.

## Left to the builder

How the plinth is drawn (extra extrusion per wall segment vs per building), the reach cap for banks (suggest
30 m), and the height-field refresh box (outline + walkway + rise/slope).

## Done means

- On a slope, uphill side: walkway then bank, no cliff; downhill side: plinth to the ground, no fill, no gap.
- Ground inside every outline stays at floor height.
- Tests: bank height/width at each slope, plinth extent, no ground inside outline, old pad values mapped,
  graded road beside a bank unchanged; live check on the QA map only (never ASU, never Done).
