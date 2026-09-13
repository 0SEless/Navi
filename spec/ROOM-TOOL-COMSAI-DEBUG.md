# Room Tool Comsai Multi-Enclosure Debug Spec

## What

Diagnose and fix the Room tool failure on `map-map-1-k6bv`, building
`osm-bldg-888026366`, floor level `0` (`flr-2-uc1f`). The saved authored
wall geometry contains seven wall segments: one outer quadrilateral and three
interior partitions. The investigation must determine the exact stage at which
expected bounded faces stop being exposed as independently clickable Room
candidates.

The server snapshot geometry is the immutable regression input. Do not snap,
normalize, close, reorder, or otherwise repair it before capturing the failing
case.

## Success criteria

1. A deterministic fixture preserves all seven saved wall IDs and endpoint
   coordinates exactly and reports authored, intersection, planar-graph, raw
   face, valid candidate, rendered candidate, and clickable candidate counts.
2. The test proves whether loss occurs in wall-to-segment conversion,
   intersection splitting, planar graph construction, bounded-face traversal,
   classification/filtering, GeoJSON candidate generation, or Room hit testing.
3. The narrowest root-cause fix makes every topologically valid Comsai enclosure
   independently selectable without globally increasing snap tolerances or
   silently closing malformed geometry.
4. Focused tests cover the exact Comsai fixture, a rectangle, adjacent shared-
   wall rooms, a valid T-junction layout, an intentional tiny gap, persistence
   round-trip, and the existing working derivation fixture.
5. The authenticated Studio floor is checked after the automated suite: Room
   tool activation, candidate clickability, save/reload preservation, console
   errors, and Wall tool regression.

## Known pitfalls from `errors/ERRORS.md`

- A stale local graph can diverge from the server snapshot. Use the server row
  as fixture authority and compare live state separately.
- Room derivation intentionally rejects open boundaries and filters utility
  faces. Quantify topology and areas instead of inferring closure from pixels.
- Do not use `reSync()` or otherwise push local state while diagnosing a
  server/local conflict.
- The checkout contains extensive unrelated work. Touch only files listed in
  the plan and preserve existing modifications.

## Non-goals

- No wider Room/Wall architecture redesign.
- No outdoor routing, CampusDocument topology, or persistence redesign.
- No global tolerance increase and no forced polygon closure.

