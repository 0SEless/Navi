# Related Work — Campus Navigation Systems

## Existing Systems

| System | Approach | Gaps Addressed by NAVI |
|--------|----------|------------------------|
| Google Maps (Campus mode) | General-purpose map, limited indoor data, no admin tools | NAVI provides campus-specific POIs, indoor floors, admin editor |
| What3Words | 3m×3m grid addressing, no routing or map visualization | NAVI provides visual map + routing + directory |
| SM Mall Wayfinding (Reference) | Kiosk-based 2D route animation | NAVI is web-based, not kiosk; includes QR/GPS positioning |
| University-specific apps (various) | Often static maps with POI markers | NAVI's component compiler allows dynamic graph updates |
| OpenStreetMap indoor mapping (Simple Indoor Tagging) | Manual tagging, no auto-generation | NAVI's compiler auto-generates graph from components |

## Academic References

### To Research:

| Topic | Search Terms |
|-------|-------------|
| Graph-based indoor navigation | "indoor navigation graph algorithm" |
| Component-based map authoring | "visual map authoring tool non-technical users" |
| Hybrid GPS+QR positioning | "hybrid positioning system campus navigation QR code" |
| A* for multi-floor routing | "A star multi-floor pathfinding building" |

### Notes

```
Use this section to log papers, articles, and comparisons as you find them.

Format:

[Author Year] Title
- Key finding:
- How NAVI relates:
- Link/DOI:
```

## Similar Projects (for Comparison)

| Project | Platform | Positioning | Map | Open Source |
|---------|----------|-------------|-----|-------------|
| [Name] | [Web/Mobile] | [GPS/BLE/QR] | [MapLibre/Mapbox] | [Yes/No] |

## Links

- [[THESIS_DEFINITION]]
- [[SM Mobile Route Animation Reference]]
