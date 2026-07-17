# Gate 4B — Studio Publish Workflow

## WHAT

Wire the Studio's toolbar **Publish** button into the production publish pipeline so that an administrator can publish a campus from the Studio using the same path as production.

No bypasses. No alternate code paths. One publish service.

## Flow

```
Toolbar Publish
    │
    ▼
Auto Validate
    │
    ├── Errors → show ProblemsPanel + "Publish Anyway"
    │
    ▼
Compiler Adapter (compile)
    │
    ▼
Publish API (write artifacts)
    │
    ▼
Success dialog (revision, nodes, edges, time, location)
```

## Success Criteria

1. **Single publish path** — The toolbar, e2e tests, and any verification script all call the same `PublishService`. No duplicate or bypass paths exist.
2. **Validation integration** — Clicking Publish auto-validates. If errors exist, the ProblemsPanel opens and a "Publish Anyway" button appears. Zero errors → publish immediately.
3. **Feedback** — After publishing, a success dialog shows revision, node count, edge count, compile time, and artifact location.
4. **Runtime verification** — After Studio publish, the runtime can load the published bundle, search works, and routing succeeds. Verified by e2e.
5. **Destination** — Artifacts written to `demo-output/` (local fs). No blob storage. Documented as P5 concern.

## Non-goals

- ❌ No blob/CDN storage (deferred to P5)
- ❌ No multi-campus publishing
- ❌ No publish history or rollback
- ❌ No Studio-side preview of published output
- ❌ No changes to the compiler or runtime

## Pitfalls from ERRORS.md

- `compiler-adapter` previously destructured response fields incorrectly (Gate 3) — must read `resp.artifacts.*`
- `EditorBridge.publish` was a no-op stub returning `{ success: true }` — must now actually persist
- Publish validation blocked UI flow in Gate 4A (errors > 0 prevented button from working) — Gate 4B must handle this gracefully with "Publish Anyway"
- Checksums must be computed from exact bytes written (2026-07-08 manifest rule)
