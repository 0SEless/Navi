# Publish compatibility findings

The browser exercised the existing Studio Validate → Build Ready → Publish flow against a synthetic campus fixture. The publish request was intercepted by the local Playwright harness and returned a synthetic success response; no external publish or cloud write occurred. One publish payload was observed and retained the legacy `campusId` and `artifacts` shape.

The legacy published `artifacts` object has no `terrainAreas` field. E8.4 therefore confirms the existing publish interaction still works, but terrain areas are not included in the published runtime format and this test does not claim terrain is visible in the user-facing runtime. Runtime terrain projection and continuous surface rendering are follow-on work.
