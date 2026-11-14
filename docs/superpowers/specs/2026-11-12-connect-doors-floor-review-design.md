# Connect Doors: review suggested connections per floor

Status: design accepted by the owner on 2026-11-12; saved uncommitted. No UI or map implementation authorized by saving this design. Existing save4 remains untouched.

## Intent and placement

Add Connect Doors inside the floor editor Navigation menu, alongside indoor route authoring. Keep the current floor visible. Avoid repeatedly selecting individual doors through overlapping rooms/walls and reopening Properties.

## Prerequisite

A floor must have an authored indoor route network joined through an entrance to the outdoor network. Report missing prerequisites explicitly; do not invent connections or modify other floors.

## Proposed interaction

Opening Connect Doors highlights the existing corridor network and unconnected doors on the current floor. Generate all eligible connection suggestions at once (e.g. six doors give up to six previews). All suggestions are temporary until reviewed and applied. Numbered markers and dashed connector previews are selectable directly; ordinary room selection must not intercept them in this mode.

The author can review and adjust each preview: drag its route endpoint, choose another segment, add/edit bends, or skip it. Recheck validity after adjustments. Show suggested, reviewed and unresolved counts. Apply reviewed connections to the working draft; campus Save remains a separate explicit action. Provide Undo and Cancel. Cancel removes previews without changing map data.

## Suggestion safety

Determine the owning room boundary and doorway exit side. Only consider routes on this floor in the entrance-reachable component. Rank by distance after rejecting connections that cross unrelated walls/rooms or leave the known floor area. Incomplete geometry, ambiguous ownership or competing candidates must produce needs-review states rather than arbitrary connections. Bend authoring and validity checks require implementation design; current door.route.connect is a straight connector and must not be assumed to support arbitrary bent paths already.

## Mobile presentation

Use a compact bottom panel that collapses during target adjustment. Enlarge invisible route/handle hit regions, highlight candidate targets, and preserve explicit confirmation for ambiguity. Keep Cancel, Undo and Apply reachable.

## Acceptance examples

- Six unconnected doors can be reviewed together without reopening Properties six times.
- Existing valid door connections are preserved and excluded from suggestions.
- A nearer route across a wall is rejected in favor of a valid accessible route, or marked unresolved.
- Cancelling a preview makes no document change; applying reviewed connections is undoable and does not save/publish.
- Changes are restricted to the active floor; missing entrance access prevents misleading suggestions.

## Follow-up under discussion

Owner requests wall-attached doors that auto-align with wall direction during 2D placement. This should be designed before implementation because wall identity and door orientation improve the reliability of route suggestions. Existing standalone doors must remain intact until an explicit migration/reattachment is approved.
