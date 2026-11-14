# Real browser floor and Preview verification - 2026-11-12

User explicitly authorized Playwright browser testing against http://localhost:3001/studio/map-map-1-375k/edit/building/bldg-2-emz6/floor/0. Used one isolated headless Chromium context at a time against the existing server. No extra development server, application source changes, Save, Done, Publish, staging or Git commits.

## Access and cleanup

Used the existing Dr. Admin development login button. This sets its mock session without navigating automatically; the first test incorrectly expected navigation and timed out, corrected after inspecting the login implementation.

The linked building was locked by jepersonsalaver. Navigating away did not release it immediately. The user separately authorized releasing only building:bldg-2-emz6 in campus map-map-1-375k; the lock endpoint returned HTTP 200, released:true. No other user lock was released.

Each test left the editor by navigation. Final cleanup released its acquired building lock (HTTP 200, released:[building:bldg-2-emz6]); the duplicate Strict Mode acquire's second release correctly returned an empty released list. Browser contexts were closed.

## Exact floor and unsaved demo

The saved test floor opened at save 12 with stairs/elevator but no authored walls, doors or windows. Dismissed its no-plan overlay through Continue without floor plan; did not force a click through the overlay.

Created four walls, an attached door, and a canonical window through the actual UI in the isolated browser's unsaved working draft. At room scale the rectangle measured approximately 10.13 m by 6.45 m. Resized the selected door's corner while Door remained active; screenshots show changed width/depth centered on the same wall, and the outliner retained exactly one unassigned door. Then created the window (approximately 1.84 m wide, height 1.2 m, sill 0.9 m) and selected 2.5D. The screenshot visibly shows an opening through the back wall, sill/header, full walls and the green door representation. No page JavaScript errors were captured.

The draft was discarded when the isolated browser closed. Before/after saved-state signatures matched: headCommit 12, 9 parts, all returned part versions/checksums unchanged. New geometry was not persisted or published. Existing stairs/elevator remain in the saved map and are visible around the temporary demo scene.

## Actual Preview button checks

- Test campus map-map-1-375k: opened its map editor and clicked Preview. Popup URL /studio/map-map-1-375k/preview?commit=12. API HTTP 200 with campus payload. Switched Cycle camera view to the tilted perspective; screenshot confirms two ordinary extruded building blocks above green ground. No failed network requests or page JavaScript errors in this run. ReadPixels GPU stall warnings occurred during screenshot capture; this is not a performance benchmark.
- ASU-IBAJAY map-asu-ibajay: opened the map editor at saved 4 and clicked Preview. Popup /studio/map-asu-ibajay/preview?commit=4 reproduced the user's screen. HTTP 422, ARTIFACT_INVALID. Each response contains 188 door roomId reference errors plus 28 door floor-reference errors (216 total). React development Strict Mode triggered two equivalent requests; do not sum their diagnostics to 432.

Conclusion: Preview's compiler/validation gating is active, and the test campus previews successfully. ASU's current blocker is exported room/floor references, not merely absent indoor route networks. Floor-editor 2.5D was demonstrated with no added navigation graph. Visitor Preview currently shows saved building blocks/ground; it does not show the unsaved test geometry. Replacing public building blocks with detailed stacked architecture remains the separately planned release.

## Artifacts

Ignored browser helper: scripts/save-v2/import-data/browser-preview-check-20261112.cjs. It blocks local API mutations except transient lock/status operations and the non-publishing Preview build; external non-read requests are blocked. The only direct non-UI mutation was the exact user-authorized test-lock release plus release of locks acquired by the test.

Screenshots/data under scripts/save-v2/import-data/browser-preview-check-20261112/:

- map-map-1-375k/demo-2d.png
- map-map-1-375k/demo-door-before-resize.png
- map-map-1-375k/demo-door-after-resize.png
- map-map-1-375k/demo-25d.png
- map-map-1-375k/campus-preview-tilted.png
- map-asu-ibajay/campus-preview.png
- per-campus preview.json with returned diagnostics and URLs.

No need to reconnect the user's Chrome extension to repeat this isolated browser workflow. It does not share the user's unsaved Chrome draft or cookies.
