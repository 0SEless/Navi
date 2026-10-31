# Track E2 — Atomicity and Failure-Injection Results

The final focused Vitest matrix passed **15 files / 103 tests**. The new batch assertions snapshot state before an invalid request and compare it afterward across:

- Campus revision and scope revision/checksums.
- Receipts for each attempted mutation ID.
- Complete change-set history.
- Checkpoint revisions.
- Reconstructed campus content and integrity checksum.

Added local batch cases cover a valid plus invalid candidate, a stale base revision, a dependency whose revision matches but checksum does not, duplicate mutation IDs, concurrent same-base edits, and lost acknowledgment followed by exact retry. Every rejected batch is verified to leave the reference store snapshot unchanged. Concurrent callers yield one committed revision and one `STALE_REVISION`, with one batch history record and one matching checkpoint. An exact retry returns `replayed` without adding receipts/history/checkpoints.

The endpoint suite verifies a batch containing building and routing operations is one local revision with no cloud acknowledgment. A new restart case commits in one `ScopedHistoryRuntime`, creates a fresh runtime, then verifies the old page session gets `SESSION_EXPIRED` and the new runtime starts empty. This is a runtime-boundary test, not a claim that real server storage was restarted or made durable.

Existing client/store/browser cases also cover lost-ack immutable request retry, campus/document switch isolation, mid-session flag disable, default-off behavior, IndexedDB corruption/schema preservation, browser process restart draft recovery, and local quota failure. The exact results are preserved in `logs/focused-vitest.log` and the Playwright result JSON files.
