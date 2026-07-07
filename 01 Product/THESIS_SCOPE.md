# NAVI Thesis Scope

## In Scope (Must Build)

- [ ] Next.js web application (App Router)
- [ ] Unified graph data model (NavNode + NavEdge + Building + Component)
- [ ] Graph class with mutations, queries, serialization
- [ ] A* pathfinding between any two nodes
- [ ] Component compiler (Room, Stair, Elevator, Hallway, Entrance)
- [ ] Component placement mode in Map Editor
- [ ] Real-time sync: component → graph → map + directory + routing
- [ ] Auto-generated hierarchical directory (Campus → Buildings → Floors → POIs)
- [ ] Read-only public map view
- [ ] Search bar filtering nodes by name
- [ ] Route visualization on map with step-by-step instructions
- [ ] GPS outdoor positioning (Geolocation API)
- [ ] QR code indoor positioning (html5-qrcode)
- [ ] 2-3 360° panoramas (Pannellum + Cloudinary)
- [ ] 2.5D building extrusion (MapLibre fill-extrusion)
- [ ] Data persistence via Supabase (PostgreSQL)
- [ ] Image storage via Cloudinary (25 GB free tier)
- [ ] Hosting via Vercel (free tier)
- [ ] One real ASU-Ibajay building with accurate data
- [ ] Graph validation with 10+ checks
- [ ] Admin authentication (mock, later Supabase Auth)

## Out of Scope (Future Work)

| Feature | Reason |
|---------|--------|
| Native mobile app (Flutter) | Next.js PWA sufficient for thesis demo |
| Multi-campus support | Design for it, implement for ASU-Ibajay only |
| Real-time indoor tracking (BLE/WiFi) | Hardware-dependent, costly |
| Turn-by-turn voice guidance | Out of scope for web app |
| Offline maps | Requires service worker + tile caching |
| Three.js 3D campus model | Nice-to-have, not core thesis |
| Public user registration | Admin-only content management |
| Analytics dashboard | Not part of navigation claim |
| Kiosk mode | Out of scope per ADR 003 |
| Accessibility-aware routing | Future enhancement |

## Success Criteria (Thesis Defense)

### Must-Have (Fail Without)

- [ ] Admin adds a Room component → 5 nodes + 5 edges auto-generated
- [ ] Directory shows all POIs grouped by building/floor
- [ ] End-user can search, select destination, see A* route on map
- [ ] GPS snaps to nearest node
- [ ] QR scan sets user position
- [ ] Data persists in Supabase across sessions
- [ ] Panorama loads from Cloudinary URL
- [ ] Deployed on Vercel, accessible from any device
- [ ] One real ASU-Ibajay building with correct data

### Nice-to-Have

- [ ] 360° panorama at 2+ nodes
- [ ] 2.5D building extrusion
- [ ] Stair + Elevator components (Room alone is sufficient for thesis claim)

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Next.js migration breaks existing code | High | Keep Vite project as fallback until migration verified |
| Supabase schema changes during development | Low | Use migration files in Supabase dashboard |
| GPS inaccurate indoors | Medium | QR is primary indoor method; GPS for outdoors only |
| 360° photo quality low | Low | Phone camera sufficient for demo |
| Component compiler bugs | Medium | Unit test each component type separately |
| Scope too wide | High | Cut 360°, GPS, QR if behind schedule — core is graph + compiler + routing |

## Links

- [[THESIS_DEFINITION]]
- [[THESIS_IMPLEMENTATION_PLAN]]
- [[THESIS_ARCHITECTURE]]
- [[THESIS_DATA_MODEL]]
- [[THESIS_NEXTJS_MIGRATION]]
