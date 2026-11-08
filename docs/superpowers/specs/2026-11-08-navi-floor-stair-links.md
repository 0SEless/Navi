# NAVI: indoor stairs and lifts connect floor to floor

Date: 2026-11-08. Status: **Written, waiting for owner review.** Branch `feat/save-v2`
(worktree `D:\CODEme\Navi\.navi-worktrees\navi-save-v2`).

## Why

- **Upper floors cannot be reached today (Verified).** A three-floor building built with Studio's own commands
  (`src/studio-v2/route-network-floors.e2e.test.ts`, uncommitted): with the stair as the floor editor leaves it, 2F and
  3F are cut off and Publish refuses ("not reachable from any entrance").
- **Cause (Verified in code).** The floor editor's stair tool creates a stair with a shape on the floor it is drawn on
  only (`levels: { [floor]: … }`, range "this floor → next"). The floor editor shows, and the compiler uses, a stair
  only on floors where it has a shape. Nothing in Studio gives it a shape on another floor (`feature.level.copy` exists
  but no screen calls it), and two stairs drawn on two floors are separate stairs the compiler never pairs.
- **What already works (Verified).** When one stair does have a point on each floor, the route goes road → door → 1F →
  stair → 2F → 3F → room, and the step is marked stairs. Each stair point joins its own floor's route line by itself
  (nearest route point within 50 m) — no manual linking needed there.

## The owner's model (agreed in chat 2026-11-08)

- Each floor draws **its own** stair or lift (straight, U-turn, …); shapes are never copied between floors. How they
  look together in 3D comes later.
- A stair's job here is only to **connect** one floor to the next.
- A newly placed stair starts **unconnected**.
- When a stair is placed on a floor next to a floor that has a stair, Studio **connects them automatically**.
- The panel on the right shows a selected stair's connections — **Connects down to** and **Connects up to** — and the
  admin can change either (pick another stair on that floor) or disconnect it.
- Lifts work the same way.

## Design

### 1. Saved data

- Stairs and lifts (`building.staircases[]`, `building.elevators[]`) get an optional `links?: { below?: string; above?:
  string }` — the id of the stair (or lift) it connects to on the floor directly below / above, in the same building.
- Links are always kept **both ways** (A.above = B ⇔ B.below = A) and only between **adjacent floors** (the floor
  directly above or below) and the **same kind** (stair ↔ stair, lift ↔ lift).
- New stairs and lifts are created on one floor only: `fromLevel = toLevel = the floor` (their old "this floor → next"
  range is what made Validate warn "spans to floor N but has no geometry").
- No new part kind and no server change: stairs and lifts are part of the building's saved data already.

### 2. Placing (automatic connect)

When a stair or lift is placed on floor N (same undo step as placing it):
- **Down:** among same-kind items on floor N−1 with no `above` link, connect to the one closest in position (building
  metres). None → stays unconnected downwards.
- **Up:** likewise with floor N+1 items that have no `below` link.
- Placing in the middle of a stack therefore connects both ways; placing the first stair connects nothing.

### 3. Panel (right side, floor editor)

For a selected stair or lift:
- **Connects down to:** `<floor label> · <name>` or "— not connected —", with a dropdown of the same-kind items on the
  floor below (the current one ticked) and **Disconnect**.
- **Connects up to:** the same for the floor above.
- No floor below / above in the building → that line reads "No floor below" / "No floor above".
- Choosing a stair that is already connected to another one moves the link (its old partner loses it), as one undo step.
- The old "floor range" fields are removed from this panel (connections replace them).

### 4. Deleting

Deleting a stair or lift removes its links from its partners in the same undo step (undo restores both).

### 5. Routing (compiler)

- Each stair or lift keeps one point per floor it is on (as today), joined to that floor's route line (as today).
- Each connection becomes a stairs (or lift) step between the two points, exactly like the steps between the floors of
  one stair today — directions say "stairs"/"lift" and the floor changes.
- Stairs and lifts in older data that already have a shape on several floors keep working unchanged.

### 6. Validate

- Warning (never a block): **"Stair "<name>" on <floor> isn't connected to another floor"** for a stair or lift in a
  building with more than one floor that has no connection and no shape on another floor. Same wording with "Lift".

## Out of scope

- Showing stairs as one 3D object across floors; matching shapes between floors.
- A stair that skips a floor (1F straight to 3F) — adjacent floors only for now.
- Escalators, ramps inside buildings.
- Step-free routing in NAVI Web (separate).

## Testing

- `route-network-floors.e2e.test.ts` (rewritten to the new model): a stair placed on 1F, 2F and 3F with the floor
  editor's commands auto-connects 1F↔2F↔3F; road → door → 1F → stairs → 2F → 3F → Office 301 is found and marked
  stairs; the same with lifts.
- Commands: auto-connect down/up/both/none, nearest when several, connect/move/disconnect keep links both ways (one
  undo step each), delete clears partners and undo restores.
- Panel: shows down/up lines, the dropdown lists only the adjacent floor's same-kind items, "No floor above".
- Validate: the unconnected-stair warning; none for a connected stair or a one-floor building.
- Browser lane: place stairs on two floors in the floor editor, see "Connects down to 1F · Stair", Save, Preview a
  route to the upper floor.
