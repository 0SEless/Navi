# Track E8.3 — Failure and Conflict Recovery

- Two independent editors started from the same campus revision. The first valid writer committed; the stale writer received `409 STALE_REVISION` and its authored change remained in the local draft.
- The stale writer's persistent Chromium profile was closed and reopened. IndexedDB still contained the Lab edit, Studio rendered it, and the durable-save status showed a conflict after recovery.
- A server commit with a deliberately lost browser acknowledgment was retried with identical request bytes. The retry replayed the original receipt and did not create a second campus revision. A later Lab edit then committed independently.
- Synthetic database tests rejected a changed payload reusing a mutation ID and verified no partial transaction rows survived an injected failure.

## Corrective change

The recovery trace exposed that durable-session initialization could replace a recovered editor document with the server snapshot. Initialization now preserves a non-idle IndexedDB draft when there is a difference; drafts already marked conflicted remain visibly conflicted. The recovery gate also retains the editor session across recovery-status transitions and rebuilds it only when the campus identity changes. A fresh context is loaded without seeding a stale graph cache.

The failed runs that exposed the issue and their Playwright traces remain in `logs/browser-*`. The passing replay and restart proof is `logs/browser-46b34be9990b4617/playwright.log`.
