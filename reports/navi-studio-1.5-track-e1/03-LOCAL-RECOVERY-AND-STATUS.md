# Track E1 — Local Recovery and Save Status

## Development gates

The scoped integration requires all of:

- `NODE_ENV=development`
- `NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY=true` (new flag, default OFF)
- `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true` (existing IndexedDB draft gate)

The client additionally requires browser IndexedDB before starting the reference workflow. The `/api/dev/scoped-history` route is only available in Development with the flags enabled and accepts loopback host/origin requests. It is a same-origin local reference endpoint and is not an authentication substitute for any production API.

## Draft and history boundaries

IndexedDB remains the persistent local draft repository. Existing recovery validation and server-version conflict behavior remain in the existing graph store. The in-memory scoped store is ephemeral and scoped to a page session. On reload, the client seeds a new local baseline from the recovered editor document and starts at a new session revision; it does not claim that the prior scoped history survived. A session-expired response leaves the draft/editor content available and requires a new session rather than silently replaying against stale history.

## Status semantics

The existing Studio save indicator keeps its current workflow/cloud status. When the flag is enabled, an additional status distinguishes session-only history, local validation, rejection, conflict and local endpoint error. The validated label explicitly says “not cloud-saved.” Every client state keeps `cloudAcknowledged: false`; scoped local receipts never set graph-store server revision or cloud sync status.

Manual Cloud Save continues through the existing persistence adapter, per-campus graph queue and `/api/graph`. Publish remains on its existing route. The new scoped endpoint does not proxy either action.
