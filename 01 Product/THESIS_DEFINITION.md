# THESIS — NAVI: Graph-Driven Campus Navigation System

## Identity

| Field | Value |
|-------|-------|
| **Title** | NAVI: A Graph-Driven Web-Based Campus Navigation System with Component-Based Map Editing and Hybrid Positioning |
| **Author** | [Your Name] |
| **Institution** | Aklan State University – Ibajay Campus |
| **Degree** | Bachelor of Science in Information Technology |
| **Target Defense** | [Date] |

## 30-Second Pitch

NAVI is a web-based campus navigation system where a single graph model drives the map, directory, and routing engine. Administrators place intelligent components (rooms, stairs, elevators) which auto-generate the navigation graph. Students search for destinations, view interactive maps, and receive A*-calculated turn-by-turn directions. Positioning uses GPS outdoors and QR codes indoors — no expensive hardware required.

## Core Concept

NAVI represents the campus as a **multi-layered navigation graph**:

- **Nodes** = meaningful locations (rooms, stairs, entrances, facilities)
- **Edges** = walkable connections between nodes
- **Buildings and floors** = hierarchical containers organizing the graph
- **Campus** = top-level graph container

The graph is the authoritative source of truth. Every system view — map rendering, directory listing, route calculation — is derived from it.

## Thesis Claim (Contribution)

> NAVI introduces a **component-based graph compiler** that converts high-level spatial components (rooms, stairs, elevators, hallways, entrances) into a unified navigation graph, from which all system views — interactive map, hierarchical directory, and A* routing — are automatically derived. This eliminates the manual effort of maintaining separate map geometry and navigation data, and enables non-technical campus administrators to create and update the navigation system through visual component placement.

**Why this is thesis-worthy:**

- Existing campus navigation apps require separate map data + route data
- NAVI's component compiler generates both from a single admin action
- The graph-driven architecture makes the system extensible to any campus
- Hybrid GPS+QR positioning avoids costly indoor tracking infrastructure

## Key Differentiators

| vs. Google Maps | vs. Other Campus Apps | vs. Static Maps |
|----------------|----------------------|----------------|
| Campus-specific POIs | Component-based editor | Interactive routing |
| Indoor floors + 360° | Auto-generated directory | GPS + QR positioning |
| Admin-controlled data | Graph as source of truth | Real-time path calculation |

## Links

- [[THESIS_TECH_STACK]]
- [[THESIS_ARCHITECTURE]]
- [[THESIS_DATA_MODEL]]
- [[THESIS_IMPLEMENTATION_PLAN]]
- [[THESIS_SCOPE]]
- [[THESIS_RELATED_WORK]]
