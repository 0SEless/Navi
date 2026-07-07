---
tags: [#role/pm, #status/planning]
complexity: L
depends-on: [[public-map-and-routing]]
phase: 4
last-updated: 2026-06-20
---

# Positioning and Panorama

## Goal
GPS outdoor positioning, QR indoor positioning, and 360° panorama viewing with Cloudinary.

## Acceptance Criteria (Must-Have)
- [ ] GPS "You are here" marker on public map when location granted
- [ ] GPS snaps to nearest walkable node (accuracy < 20m)
- [ ] QR scanner opens from button → reads QR → sets position
- [ ] QR encodes `navi://node/{nodeId}` format
- [ ] Panorama viewer loads 360° images from Cloudinary URL
- [ ] Panorama hotspots link to other panorama nodes
- [ ] Admin uploads images via Cloudinary Upload Widget
- [ ] Admin generates QR codes from admin panel

---

## Feature 4a — GPS Positioning

### Subtasks
- [ ] [DEV] `src/hooks/useGeolocation.ts` — Geolocation API wrapper
- [ ] [DEV] "You are here" blue dot marker on Maplibre map
- [ ] [DEV] Accuracy radius circle (semi-transparent)
- [ ] [DEV] Auto-snap to nearest node when accuracy < 20m
- [ ] [DEV] Fallback states: denied, unavailable, timeout
- [ ] [DEV] Re-centering button (pan to current location)
- [ ] [QA] Mock GPS coordinates in dev → marker appears at correct position
- [ ] [QA] GPS denied → user sees informative message, manual positioning available

---

## Feature 4b — QR Positioning

### Subtasks
- [ ] [DEV] QR scanner modal with html5-qrcode
- [ ] [DEV] QR code encoding: `navi://node/{nodeId}`
- [ ] [DEV] QR parser: extract nodeId → lookup in graph-store → set position
- [ ] [DEV] QR generation page in admin panel (`/admin/qr`)
- [ ] [DEV] Print-friendly QR code export (per node, per floor)
- [ ] [DEV] Camera permission flow (iOS-safe: user gesture triggers scan)
- [ ] [QA] Scan mock QR → position snaps to correct node
- [ ] [QA] Camera denied → manual entry fallback
- [ ] [QA] Invalid QR → error toast

---

## Feature 4c — 360° Panoramas

### Subtasks
- [ ] [DEV] Pannellum component: `src/components/panorama/PannellumViewer.tsx`
- [ ] [DEV] Panorama data integration: node → panorama image URL
- [ ] [DEV] Hotspot linking: click hotspot → load different panorama
- [ ] [DEV] Hotspot editor in admin panel (add/remove hotspots per panorama)
- [ ] [DEV] Panorama thumbnail gallery in `/admin/panoramas`
- [ ] [DEV] Panorama viewer on public map (click panorama node → opens overlay)
- [ ] [QA] Load panorama from URL → renders in Pannellum
- [ ] [QA] Hotspot click → loads linked panorama
- [ ] [QA] Invalid URL → graceful error

---

## Feature 4d — Cloudinary Integration

### Subtasks
- [ ] [DEV] Cloudinary upload widget in admin panel (panoramas + building photos)
- [ ] [DEV] Replace data URL placeholders with real Cloudinary URLs
- [ ] [DEV] Responsive image srcsets with Cloudinary URL transforms
- [ ] [DEV] Cloudinary MCP server configured (per previous ADR-002)
- [ ] [QA] Upload image → URL returned → image loads on page
- [ ] [QA] Responsive srcsets: mobile loads smaller image

## Links
- [[full-system-plan]]
- [[../../02-architecture/ADRs/adr-005-positioning-architecture]]
- [[../../02-architecture/ADRs/adr-007-image-storage-strategy]]
- [[cloudinary-integration]]
