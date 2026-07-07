# NAVI Platform Upgrade Plan

## Goal

Upgrade NAVI from a single-campus navigation app into a reusable multi-campus navigation platform.

## Platform Additions

### Multi-Campus Foundation

- Add `campuses` as the parent entity for buildings, departments, faculty, panoramas, QR codes, route nodes, and route edges.
- Use `campus_id` to isolate data per campus.
- Add campus selection, GPS-based campus discovery, or QR-based campus entry in the mobile app.

### Map Integration Layer

- Add campus-specific map settings for provider, map center, zoom, style, and boundary.
- Support OpenStreetMap/Mapbox-compatible maps first.
- Keep provider logic behind a map adapter so the app is not locked to one provider.

### Route Graph

- Replace simple paths with `route_nodes` and `route_edges`.
- Use nodes for gates, entrances, intersections, rooms, offices, QR points, and panorama points.
- Use edges for walkable connections with distance, travel type, and indoor/outdoor metadata.

### Mobile 2D Route Visualization

- Draw an animated 2D line from the user's current or selected start point to the destination.
- Use the SM mall wayfinding example only as visual inspiration for route clarity.
- Keep the feature mobile-first and avoid kiosk or Direction Hub scope.

### Admin Mapping Tool

- Let admins create campuses, buildings, floors, rooms, routes, QR points, panoramas, hotspots, and map settings.
- Add publish/review flow before campus data becomes visible to end users.

## Initial Implementation Order

1. Database redesign: campuses, map settings, route nodes, route edges, floors, rooms, and QR location support.
2. Backend API: campus-scoped CRUD, map settings, destination search, QR resolution, route calculation.
3. Admin dashboard: campus onboarding and mapping tools.
4. Mobile app: campus selector, map view, route display, QR scanner, offline cache.
5. Mobile route visualization: animated 2D route line, destination marker, progress state, and turn-by-turn support.

## Links

- [[TODO]]
- [[NAVI Project Requirements]]
- [[NAVI System Architecture]]
- [[NAVI Database Design]]
- [[ADR 001 - Multi Campus Platform]]
- [[ADR 002 - PostgreSQL PostGIS Database]]
- [[ADR 003 - Mobile 2D Route Animation]]
