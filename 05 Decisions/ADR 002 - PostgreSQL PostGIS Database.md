# ADR 002 - PostgreSQL PostGIS Database

## Decision

NAVI will use self-managed PostgreSQL with PostGIS as the main backend database. Supabase will not be used for the main backend.

## Reason

NAVI needs spatial data support for campus boundaries, building coordinates, route nodes, route edges, map paths, QR locations, nearest-point queries, and indoor/outdoor route transitions. PostgreSQL + PostGIS provides a strong open-source foundation while keeping the architecture independent from a hosted backend platform.

## Rejected Alternatives

- Supabase: useful and fast to build with, but the project direction prefers a self-managed backend stack.
- SQLite as main database: lightweight, but not ideal for multi-user web APIs, concurrent admin updates, and spatial platform data.

## Project Impact

- Main database: PostgreSQL + PostGIS.
- Mobile/offline cache: SQLite.
- Backend: Node.js + Express.
- Object storage is still needed for panoramas and building images.
- Database schema must support multi-campus ownership through `campus_id`.

## Links

- [[TODO]]
- [[NAVI Platform Upgrade Plan]]
- [[NAVI Database Design]]
