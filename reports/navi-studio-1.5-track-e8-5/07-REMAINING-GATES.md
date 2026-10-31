# Remaining Gates and Next Milestone

E8.5 completes an authored polygon publishing and visualization foundation. The following remain separate engineering milestones:

1. **Continuous terrain:** define and author a mesh or sampled surface, interpolation semantics, spatial resolution, quality constraints, and browser/mobile performance budget. Discrete E8.5 polygons are not that surface.
2. **Shared vertical integration:** add authored building foundation and road elevations against the existing campus datum. Do not infer them from nearby polygons.
3. **Navigation across elevation:** design topology for ramps, stairs, bridges, elevated walkways and entrances with explicit vertical transitions. E8.5 does not alter route topology.
4. **Conflict semantics:** define how overlapping authored areas at different elevations should be reviewed and eventually resolved; E8.5 displays area values without claiming a resolved physical surface.
5. **Real Development readiness:** separately establish authorization, backup/recovery evidence for the real Development database, migration plan/review, rollback, data owner approval, and an explicit migration authorization. Synthetic E5 success does not authorize or prove recovery of real Development or Production.
6. **Production publishing:** separately review artifact rollout and compatibility before any cloud publish or deployment. No cloud route was invoked for this track.

**Recommended next milestone:** E8.6 should define the continuous terrain surface and shared datum integration contract, including how overlap conflicts are surfaced and how runtime consumers sample elevation. Keep that work synthetic until its own design, database and release approvals are complete.
