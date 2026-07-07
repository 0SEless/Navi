---
tags: [#role/qa, #status/planning]
last-updated: 2026-06-20
---

# System-Wide Test Strategy

## Testing Stack
- **Unit**: Vitest (engine layer, pure TS)
- **Component**: Vitest + React Testing Library (UI components)
- **E2E**: Playwright (critical user flows)
- **Manual**: Checklist for thesis defense demo

---

## Phase 2 — Database Persistence

### Unit Tests
| Test | File | Status |
|------|------|--------|
| db-schema: camelCase ↔ snake_case roundtrip | `src/lib/__tests__/db-schema.test.ts` | ❌ |
| db-schema: toPoint, toPolygon geometry creation | `src/lib/__tests__/db-schema.test.ts` | ❌ |
| db-schema: building/node/edge row serializers | `src/lib/__tests__/db-schema.test.ts` | ❌ |

### E2E Tests
| Test | Flow | Status |
|------|------|--------|
| Persistence roundtrip | Save graph → reload page → data appears | ❌ |
| API GET returns graph | Fetch /api/graph → 200 + valid JSON | ❌ |
| API POST persists | Save → fetch → check data matches | ❌ |

### Edge Cases
- Empty graph snapshot
- Graph with 1 node, 0 edges
- Graph with 5000+ nodes (performance)
- Invalid GeoJSON geometry
- Missing required fields (name, type)

---

## Phase 3 — Public Map & Routing

### Unit Tests (Engine)
| Test | File | Status |
|------|------|--------|
| A* finds shortest path in simple graph | `src/engine/__tests__/a-star.test.ts` | ❌ |
| A* returns null for disconnected nodes | `src/engine/__tests__/a-star.test.ts` | ❌ |
| A* handles single-node graph | `src/engine/__tests__/a-star.test.ts` | ❌ |
| A* prefers shorter path over longer | `src/engine/__tests__/a-star.test.ts` | ❌ |
| Directory builds correct tree from graph | `src/engine/__tests__/directory.test.ts` | ❌ |
| Directory handles empty graph | `src/engine/__tests__/directory.test.ts` | ❌ |
| Directory handles buildings with no floors | `src/engine/__tests__/directory.test.ts` | ❌ |
| Search returns correct subset (exact match) | `src/lib/__tests__/search.test.ts` | ❌ |
| Search returns correct subset (fuzzy match) | `src/lib/__tests__/search.test.ts` | ❌ |
| Search returns empty for no match | `src/lib/__tests__/search.test.ts` | ❌ |
| ComponentCompiler: Room → 5 nodes + 5 edges | `src/engine/__tests__/component-compiler.test.ts` | ❌ |
| ComponentCompiler: Stair → floor transition nodes | `src/engine/__tests__/component-compiler.test.ts` | ❌ |
| ComponentCompiler: all 5 component types | `src/engine/__tests__/component-compiler.test.ts` | ❌ |
| GraphValidator: 10 validation checks | `src/engine/__tests__/graph-validator.test.ts` | ❌ |

### E2E Tests (Playwright)
| Test | Flow | Status |
|------|------|--------|
| Public map loads | Navigate to /map → map tiles visible in viewport | ❌ |
| Directory sidebar renders | Building → Floor → POI hierarchy visible | ❌ |
| Search filters results | Type "room" → only room results | ❌ |
| Click search result pans map | Click result → camera moves to node position | ❌ |
| Route renders on map | Select 2 nodes → route line appears | ❌ |
| Step-by-step panel shows | Route rendered → turn instructions visible | ❌ |
| Mobile layout | <768px → sidebar becomes bottom sheet | ❌ |

### Edge Cases
- Graph with zero nodes → map shows empty state
- No route exists between selected nodes → "No route found" message
- User searches with special characters → handled gracefully
- 500+ nodes → map rendering performance acceptable

---

## Phase 4 — Positioning & Panorama

### Unit Tests
| Test | File | Status |
|------|------|--------|
| Node snapping: nearest node found | `src/engine/__tests__/graph.test.ts` | ❌ |
| Node snapping: equidistant → picks first | `src/engine/__tests__/graph.test.ts` | ❌ |
| Node snapping: no nodes → returns null | `src/engine/__tests__/graph.test.ts` | ❌ |
| QR parser: valid code → nodeId | `src/lib/__tests__/qr.test.ts` | ❌ |
| QR parser: malformed → error | `src/lib/__tests__/qr.test.ts` | ❌ |

### E2E Tests
| Test | Flow | Status |
|------|------|--------|
| GPS marker shows | Grant location → blue dot appears on map | ❌ |
| QR scan sets position | Scan QR → marker moves to node | ❌ |
| Panorama loads | Click panorama node → Pannellum opens | ❌ |
| Hotspot navigates | Click hotspot → different panorama loads | ❌ |

### Edge Cases
- GPS accuracy > 20m → don't snap, show accuracy warning
- GPS permission denied → informative message, manual positioning
- QR camera permission denied → manual node selector fallback
- QR scan invalid code → error toast
- Panorama URL 404 → graceful error message

---

## Phase 5 — Real Building & Demo

### Manual Test Checklist (Thesis Defense)
- [ ] Admin login works (Google OAuth)
- [ ] Admin adds Room component → 5 nodes + 5 edges auto-generated
- [ ] Directory shows all POIs grouped by building/floor
- [ ] End-user searches, selects destination, sees A* route on map
- [ ] GPS snaps to nearest node (demo with dev tools mock)
- [ ] QR scan sets user position (demo with printed QR code)
- [ ] Data persists in Supabase across sessions (save → reload)
- [ ] Panorama loads from Cloudinary URL
- [ ] Deployed on Vercel, accessible from phone + laptop
- [ ] ASU-Ibajay building rendered with correct data

### Performance Checklist
- [ ] Map loads < 3s on fast connection
- [ ] Route calculation < 500ms for 1000-node graph
- [ ] Search returns results < 200ms
- [ ] Panorama loads < 5s on fast connection
- [ ] Lighthouse score > 80 (mobile)

## Bug Report Template
```markdown
---
title: "[Bug] <short description>"
severity: critical|major|minor
affected-phase: 2|3|4|5
---
**Expected:** ...
**Actual:** ...
**Steps:** 1. ... 2. ...
**Environment:** Browser, OS, viewport
**Screenshots:** ...
```

## Links
- [[../01-planning/features/full-system-plan]]
- [[../01-planning/features/public-map-and-routing]]
- [[../01-planning/features/positioning-and-panorama]]
