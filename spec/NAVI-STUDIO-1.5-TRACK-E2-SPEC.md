# NAVI Studio 1.5 — Track E2 Specification

## Goal

Complete the executable browser acceptance left open in E1, exercise the scoped-history path with the flag off and on, harden atomicity/failure tests, and diagnose the local Next/Playwright startup issue without changing cloud or Production infrastructure.

## Success criteria

1. The test harness uses a verified free loopback port and returns a real HTTP response before browser execution; startup failures include actionable diagnostics.
2. Flag-off browser acceptance confirms existing Studio editing, IndexedDB recovery, and mocked cloud-save behavior with zero scoped-history requests.
3. Flag-on browser acceptance confirms local scoped operations/status and IndexedDB recovery, while the mock continues to reject external/data API traffic and `/api/graph` stays on its existing path.
4. Atomicity/failure tests prove failed batches leave revision, receipts, history, checkpoints and stored document state unchanged; retries and campus/session boundaries are explicit.
5. Focused Vitest, ESLint and TypeScript baseline comparison are recorded. No cloud, migration, deployment or Production action occurs.

## Boundaries and known pitfalls

- Preserve the E1 default-off dual flag and local-only endpoint; do not make a local receipt a cloud acknowledgment.
- Keep the editor document authoritative and do not mutate the actual campus dataset.
- Use synthetic campus fixtures, the isolated localhost auth stub, and network rejection/interception.
- Do not kill unrelated listeners. The NAVI checkout on port 3000 is unrelated to the E2 harness.
- Do not edit generated `.next` files or remove the full `.next` directory. The E1 TS1434 appeared in a transient generated validator whose import later became valid.
- Earlier Track C1 acceptance distinguished the flag-off revision conflict from a successful mocked write; do not weaken that guard to force the test through.
- Existing Track C1 browser artifacts show the harness has passed before; compare the current startup behavior to those runs.
