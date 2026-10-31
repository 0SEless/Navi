# Authorization Acceptance

Authentication tests used injected verified synthetic identities and the browser harness used only a local Auth stub at `127.0.0.1:45678`. No real Supabase project was contacted.

Focused result: **7 files / 59 tests passed** for request, route, auth, snapshot/session, client, and SaveStatus coverage. The test runner's temporary directory was redirected into the repository because Windows sandbox temp rename operations initially failed with `EPERM`.

| Case | Result | Evidence |
| --- | --- | --- |
| Verified global administrator | Allowed | `mutation-auth.test.ts`; scoped request policy test |
| Unauthenticated / no session | Denied before verifier/store work | mutation-auth and request boundary tests |
| Invalid or expired session / verifier failure | Denied (401) | mutation-auth tests |
| Campus administrator without trusted ACL | Denied before store creation | scoped request policy test |
| Client-supplied role or actor spoofing | Cannot grant authorization | mutation-auth tests; unknown body keys rejected |
| Protected campus | Denied before store/transaction creation | scoped request and mutation-auth tests |
| Invalid payload, malformed dependencies, oversized JSON | Rejected before storage | scoped request tests |
| Invalid content checksum | Rejected as invalid candidate before commit | scoped request tests |
| Cross-campus without trusted authorization | Denied before store creation | campus-admin/no-ACL test exercises fail-closed campus scope |

For accepted commits, the route calls its authenticated principal verifier and authorization function before constructing the storage adapter. Unit tests assert the store factory is not called for denied cases. Browser POSTs to the local route confirmed the synthetic Auth stub identity was accepted; later browser attempts exposed the editor workflow issue recorded in `03-BROWSER-END-TO-END.md`.
