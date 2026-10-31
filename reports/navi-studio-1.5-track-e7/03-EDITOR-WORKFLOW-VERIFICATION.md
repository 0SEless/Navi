# Editor Workflow Verification

## Exercised workflow

The E5 integration used synthetic content only. It seeded five scopes, changed Building A and then Building B independently, verified Building A was unchanged after the Building B save, committed a route with dependencies on both building revisions, updated terrain and campus settings, replayed an identical mutation, and raced two stale writers. Exactly one racing write committed; the other returned `STALE_REVISION`.

The winning building change made the previously saved route dependency baseline stale. The harness then resaved that route with the current building revisions before reconstructing the full campus document. Reconstruction contained both buildings, the refreshed route, terrain, and settings. This confirms dependency refresh is part of a consistent publish-ready reconstruction.

Existing tests cover IndexedDB round-trip/recovery, save failure state, preservation of local drafts, draft recovery before editor mount, legacy graph API behavior, publish contracts, and navigation behavior. The 28-file regression run passed all 276 tests.

## Limits

The E5 workflow is a server-side synthetic adapter test; it does not operate the browser editor against PostgreSQL. Existing publisher tests validate the legacy publish endpoint independently. No actual publish request was issued from the reconstructed E5 document. The development editor bridge itself uses a loopback-only in-memory service and is not an authenticated durable save path.
