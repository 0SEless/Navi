# TypeScript Debt Classification

## Current result

Fresh `npx tsc --noEmit --pretty false` exited 2 and emitted **1,128 diagnostics**, matching the C1 current result (1,128). The new C2 production service has zero diagnostics; two initial C2 test-only union-narrowing errors were fixed before the final count. C2 did not attempt a broad refactor.

| Package/root | Diagnostics |
|---|---:|
| `src` | 408 |
| `packages/editor` | 264 |
| `packages/compiler` | 234 |
| `packages/runtime` | 87 |
| root `__tests__` | 69 |
| `packages/core` | 20 |
| `scripts` | 19 |
| `apps` | 14 |
| `e2e` | 10 |
| `.next` | 1 |
| `packages/editing-engine` | 1 |
| `packages/publisher` | 1 |

By file class: **958 tests/specs**, **170 source files**. Most frequent codes: `TS2339` 213, `TS18048` 169, `TS2345` 141, `TS2322` 94, `TS2554` 88, `TS2739` 87, `TS18046` 54, `TS2741` 48, `TS2353` 37, `TS2352` 30, `TS7006` 22, `TS2740` 19.

## Attribution and impact

There are 23 diagnostics in file paths touched by Track B/C1 (22 under `src`, one in `packages/editor`). That is a path-overlap count, not evidence these diagnostics were introduced by those tracks. Direct line comparison of the prior C1 log and current C2 log produced 0 differing diagnostic lines; Track B/C1 did not claim a clean typecheck. The separate C1 log is preserved at `reports/navi-studio-1.5-track-c1/logs/typescript-final-20261029.log`.

The one `.next/types/app/api/graph/route.ts` error reports a non-HTTP `getClient` export in a Next route module and is the highest build/type-generation priority. The previous C1 production Webpack build passed despite this broader typecheck debt; that does not clear route type validation. Remaining source diagnostics in `src`, `packages/editor`, and `packages/compiler` have potential runtime/build impact and need triage by owning package. The larger test-only volume affects development confidence and CI but does not imply all diagnostics are runtime defects.

## Suggested repair order

1. Resolve the Next route-export diagnostic and any source type errors that block route generation/build.
2. Triage server authorization, persistence, compiler, and data-shape errors in `src` and `packages/compiler` by package owner.
3. Repair `packages/editor` context/persistence types in focused feature slices; re-run relevant editor tests.
4. Repair core/runtime public type contracts, then update dependent package tests.
5. Address remaining test-only diagnostics in batches with the closest contract owner; avoid mass casts or widening public APIs to `any`.

No other TypeScript report log is needed to verify the 1,128 count; fresh output is `reports/navi-studio-1.5-track-c2/typescript-current.log`.
