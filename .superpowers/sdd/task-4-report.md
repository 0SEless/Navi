# Task 4 Report: Route Endpoint Extend via Drag

- **Status:** DONE
- **Commit:** `0070452 feat(route): endpoint drag extends route instead of moving vertex`
- **Test summary:** `npx tsc --noEmit` — no new type errors (all errors pre-existing in other files)
- **Concerns:** None
- **Changes applied:**
  1. Added `import { haversine } from '@/engine/geo-utils'` (line 7)
  2. Added `dragOriginalsRef` after `dragStartRef` (line 64)
  3. In `handleMouseDown`: stores `isEndpoint` and `adjacentPoint` per drag (lines 152–159)
  4. In `handleMouseMove`: extend detect — when endpoint distance to adjacent exceeds 1.1× original, inserts new point instead of moving (lines 162–193)
