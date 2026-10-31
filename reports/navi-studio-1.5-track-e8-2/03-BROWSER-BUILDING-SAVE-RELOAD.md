# Browser Building Save and Reload

## Final accepted run

- Synthetic campus: `navi-e8-browser-be83696418704a03`.
- Seed: two normalized buildings, Library and Lab.
- Edited only Library name from `Synthetic Library` to `Synthetic Library E8.1 Accepted`.
- E2E observed dirty state and the changed authoritative document; the draft was present.
- Explicit Save produced one POST and one operation with scope `{ kind: "building", id: "e8-building-library" }` at expected campus revision 0.
- HTTP status 200; client accepted the acknowledgment only after validating candidate campus ID, mutation ID, request checksum, content checksum and revision.
- UI showed `Saved to local synthetic E5; not cloud-saved`.
- New Playwright browser context used fresh local storage and IndexedDB. Its GET returned E5 revision 1; reconstructed snapshot and mounted document contained the accepted Library name; rendered Explorer showed it; Lab remained `Unchanged Synthetic Lab`.
- Independent E5 verification still showed revision 1, proving reload did not create a duplicate revision.

Final sanitized trace and Playwright output:
`logs/accepted-browser-be83696418704a03ba6c0031a0f3975d/playwright.log`

Final independent E5 query output:
`logs/accepted-browser-be83696418704a03ba6c0031a0f3975d/verify.log`

Earlier first failing UI reload evidence is preserved under:
`logs/classification-trace-947846561faa445491e2486b4e39a08f/`

## Result

PASS for the Phase 3 single-building durable editor save/reload acceptance. The page-reload proof is independent of IndexedDB because the restored state was loaded in a newly created browser context with synthetic local-only harness state. The original browser draft was preserved; no draft deletion or cleanup was performed.
