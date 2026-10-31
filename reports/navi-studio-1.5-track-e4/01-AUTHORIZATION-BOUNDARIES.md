# Authorization and identity boundaries

`PostgresScopedCommitStore` now requires two injected server-side functions: `resolveTrustedActor()` to obtain the authenticated principal from server request context, and `authorizeActor({actorId,campusId,documentId,permission})` to authorize either `read` or `write`. The resolver is authoritative: write methods reject an explicit actor ID that differs from the principal returned by server context. `ScopedCommitActor.isAdministrator` or any client role claim is not used by the adapter for authorization.

| Adapter method | Required permission | Identity check |
| --- | --- | --- |
| `readCampusState` | read | Stored head campus ID and canonical document ID; repeatable-read snapshot |
| `findMutation` | read | Stored head campus ID and canonical document ID before receipt lookup |
| `reconstructCampus` | read | Stored head campus ID/document ID; checkpoint campus identity |
| `initializeCampus` | write | Trusted explicit actor must match; supplied document ID must equal canonical server document ID |
| `commitAtomically` | write | Delegates to the atomic batch path with the trusted actor |
| `commitBatchAtomically` | write | Trusted actor, locked stored campus ID, canonical document ID |

All read and write callbacks run before acquiring a database client. Read methods use a repeatable-read, read-only transaction so the campus head and its scopes/checkpoint/history are read from one snapshot. `ScopedCommitAcknowledgment.batchChecksum` is optional to preserve compatibility with E1/E2 reference stores; the durable PostgreSQL adapter always supplies it and the wrappers validate it.

The adapter remains disconnected from routes. A future server endpoint must construct/bind its trusted request-context resolver per authenticated request and authorize reads separately from mutations.
