# SM Mobile Route Animation Reference

## Reference Concept

The SM mall direction example is useful because it shows a destination route visually with a 2D line on a map. The important idea for NAVI is the route-line clarity, not the kiosk or big-screen setup.

Reference URL:

- [SM City Roxas Mall Directory](https://www.smsupermalls.com/mall-directory/sm-city-roxas/information#map)

## Observed SM Patterns

- The page centers the experience around a mall profile, store directory, and map.
- Users can search or filter destinations by category, level, building, and name.
- The wayfinding idea is simple: choose a destination, then show a clear path on a 2D map.
- The visual route is easier to understand than text-only instructions because users can see the shape of the path.
- The map experience assumes known mall structure: floors, stores, entrances, and internal walkways.

## Pattern To Learn From

```text
User chooses a destination
  -> map shows current/start point
  -> map draws a visible route line
  -> route line communicates where to go
  -> user follows the path
```

## NAVI Adaptation

NAVI will adapt the 2D animated path idea for the mobile app.

```text
Possible starts:
- GPS location
- QR code location
- Building entrance
- Indoor panorama point
- Manual selected start

Possible destinations:
- Building
- Department
- Faculty office
- Room
- Campus service
- Admin-defined point of interest
```

## What NAVI Should Borrow

- Clear destination search before navigation starts.
- A visible route line drawn directly on the map.
- Simple visual language: start marker, destination marker, route line, and direction cues.
- Floor-aware navigation for indoor areas.
- Directory-driven navigation, where users can search by building, department, faculty office, room, or service.
- Route animation that helps users understand direction, not decorative motion.

## What NAVI Should Not Borrow

- Do not make kiosk or big-screen Direction Hub mode a core feature.
- Do not limit navigation to one fixed starting point.
- Do not make NAVI mall-specific; the system remains campus-first and multi-campus.
- Do not depend on static map images if route nodes and map data are available.

## Key Difference

SM's example helps explain visual route guidance. NAVI will use the same clarity for mobile-first campus navigation across outdoor maps, indoor floor maps, QR positioning, and 360-degree panorama context.

## NAVI Mobile Route Flow

```text
User opens mobile app
  -> chooses or detects campus
  -> searches destination
  -> app calculates route from current location or selected start
  -> app animates a 2D route line on the map
  -> app supports turn-by-turn text and indoor context as needed
```

## Implementation Implications

- The mobile app needs a route layer that can draw polylines over outdoor maps and indoor floor maps.
- Route data should come from `route_nodes` and `route_edges`, not from manually drawn one-off lines.
- QR scanning should update the user's known start location when GPS is weak indoors.
- Indoor floors need enough coordinate data to place route lines, room markers, entrances, and QR points accurately.
- The animation should support reduced-motion settings and still show a static route line when motion is disabled.

## Thesis Use

Use SM as a real-world reference for visual wayfinding:

> NAVI adopts the visual clarity of mall wayfinding systems, where a selected destination is shown through a clear 2D route line. However, NAVI extends this idea into a mobile-first, multi-campus platform with GPS, QR positioning, indoor route data, 360-degree navigation context, and admin-managed campus maps.

## Links

- [[TODO]]
- [[ADR 003 - Mobile 2D Route Animation]]
- [[NAVI Platform Upgrade Plan]]
- [[NAVI System Architecture]]
- [[NAVI Database Design]]
