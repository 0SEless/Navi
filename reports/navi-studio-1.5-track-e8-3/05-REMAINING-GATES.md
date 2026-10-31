# Track E8.3 — Remaining Gates and Next Milestone

## Remaining gates

1. **Terrain authoring:** The current Studio/Floor Editor has no usable boundary or terrain-area authoring control. The smallest next change is to connect existing boundary/area authoring to the terrain scoped-save document projection, with no terrain sculpting feature. Until that editor flow is implemented and accepted in a browser, terrain editing remains unsupported.
2. **Pointer-movement efficiency:** Single building edits produced one building revision, and the atomic building-plus-routing action produced one campus revision. Pointer movement or brush coalescing was not measured because no terrain authoring tool exists.
3. **Legacy publishing:** Flags-off saving stayed on `/api/graph`; publish remained validation-disabled for the synthetic fixture. A valid synthetic fixture should be used for a browser publish smoke test before claiming actual `/api/publish` compatibility.
4. **Release/database recovery:** This proof used only local synthetic E5. It does not prove the real Development database is backed up or recoverable.

## Recommended next milestone

Implement the narrow terrain boundary/area authoring integration, then add actual-editor revision-coalescing and valid-fixture publish smoke coverage. Keep scoped saving opt-in and flags off by default.

No additional approval is needed for continued local synthetic work. Explicit owner authorization is required before any real Development database backup, migration, cloud write, Production operation, deployment, or push.
