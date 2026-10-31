# TypeScript and E8 Code Fixes

## Diagnostics

- Recorded starting point: **1,126** repository-wide TypeScript diagnostics.
- Final `npx tsc --noEmit --pretty false`: **1,124** diagnostics. The full repository check does not pass.
- Final output: [`typescript-final.log`](./logs/typescript-final.log). No final diagnostics matched the E8 route, browser acceptance code, scoped snapshot/session, or Studio history bridge.
- Existing graph-store casts and legacy `.next/types/app/api/graph` / test diagnostics remain outside this narrow E8 task.

## Changes

- Added a checksum-validating scoped campus snapshot merger so E5 reads can hydrate editor document content after a restart/reload.
- Exposed the browser-safe durable content hash used to validate reconstructed scoped content.
- Wired reconstructed E5 content into the scoped document session and editor graph projection.
- Added an explicit Studio Save control for invoking the persistence workflow.
- Tightened a room-attribute type guard in `StudioWorkspace`.
- Corrected the synthetic browser fixture to include connectivity semantics version `1.0.0`, matching the value GraphAdapter applies during editor hydration. This avoids generating a synthetic campus-settings mutation solely from fixture normalization.
- Corrected the SaveStatus test literal type and typed the E5 fault-injection client without adding production dependencies.

## ESLint

Focused ESLint passed on the E8 route/session/snapshot/client, new tests, and browser harness. Including the whole `StudioWorkspace.tsx` file reports its existing `react-hooks/set-state-in-effect` finding at line 202 (`setShowBypassDialog`); this validation effect is unrelated to scoped persistence and was not refactored.
