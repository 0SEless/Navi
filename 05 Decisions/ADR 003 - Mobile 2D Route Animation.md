# ADR 003 - Mobile 2D Route Animation

## Decision

NAVI will use mobile-first animated 2D route visualization. When a user selects a destination, the mobile app should draw a clear route line on the campus or indoor map to show where the user should go.

## Reason

The SM mall wayfinding example is useful as a visual reference because it makes the path easy to understand with a 2D animated line. NAVI will adopt that clarity, but the feature will be implemented for mobile navigation, not as a kiosk or Direction Hub system.

## Rejected Alternatives

- Direction Hub or kiosk mode: out of scope for NAVI at this stage.
- Static route line only: simpler, but less clear than an animated route that communicates direction and progress.
- Text-only directions: useful as support, but not enough for map-based campus navigation.

## Project Impact

- Mobile route screens should show an animated 2D line toward the selected destination.
- Route visualization should work for outdoor campus maps and indoor floor maps.
- Route calculation should still use route nodes and route edges.
- QR scanning may set the user's current location, but it should not imply kiosk handoff.
- The admin mapping tool should focus on route graph creation, not kiosk management.

## Links

- [[TODO]]
- [[NAVI Platform Upgrade Plan]]
- [[SM Mobile Route Animation Reference]]
