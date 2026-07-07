---
tags: [#role/architect, #status/planning]
date: 2026-06-20
title: "ADR-005: Hybrid Positioning Architecture (GPS + QR)"
---

# ADR-005: Hybrid Positioning Architecture (GPS + QR)

## Status
Proposed

## Context
NAVI must determine the user's location for:
- "You are here" marker on map
- Route start-point for directions
- Floor-level context (which floor is the user on)

GPS works outdoors but not indoors. QR codes provide precise indoor positioning but require scanning.

## Decision
1. **Dual positioning system**: Geolocation API for GPS outdoors, html5-qrcode for QR indoors.
2. **Priority order**: QR scan position overrides GPS (QR is more precise).
3. **Node snapping**: Both GPS coords and QR-resolved node IDs snap to nearest walkable node in graph.
4. **Fallback chain**: QR position > GPS position > manual map click > "Location unknown".
5. **GPS accuracy radius**: Show accuracy circle on map; auto-snap only when accuracy < 20m.
6. **QR encoding**: QR encodes `navi://node/{nodeId}` — same scheme used on all platforms.
7. **No indoor GPS**: GPS accuracy indoors is poor; QR is the primary indoor method. No WiFi/BLE triangulation.

## Alternatives Considered
- **BLE beacons**: Hardware cost + deployment effort → out of scope.
- **WiFi fingerprinting**: Complex setup, environment-dependent → out of scope.
- **GPS-only**: Fails indoors → insufficient for thesis criteria.

## Consequences
- QR codes must be printed and posted at real locations for demo.
- iOS Safari requires user gesture to open camera → UX flow designed accordingly.
- Node snapping must handle edge cases (equidistant nodes, disconnected subgraphs).

## Links
- [[full-system-plan]]
