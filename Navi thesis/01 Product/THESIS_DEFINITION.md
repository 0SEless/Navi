# NAVI Thesis Definition

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

## Thesis Claim (Contribution)

> NAVI introduces a **component-based graph compiler** that converts high-level spatial components (rooms, stairs, elevators, hallways, entrances) into a unified navigation graph, from which all system views — interactive map, hierarchical directory, and A* routing — are automatically derived. This eliminates the manual effort of maintaining separate map geometry and navigation data, and enables non-technical campus administrators to create and update the navigation system through visual component placement.

## Core Mathematical Model

NAVI models the campus as a **weighted, directed graph** $G = (V, E, W)$, where:

- **Nodes ($V$)**: Represent distinct spatial coordinates, categorized as:
  - *Indoor Locations*: Rooms, offices, restrooms, and hallway intersections.
  - *Vertical Connectors*: Stairways and elevator shafts.
  - *Outdoor Transit Points*: Entrance doors, parking lots, walkways, and campus landmarks.
- **Edges ($E$)**: Represent walkable, physical path connections between nodes.
- **Weights ($W$)**: Represent the travel cost (distance in meters + difficulty multipliers) between connected nodes.

### Interconnected Subgraphs

To handle multi-floor and campus-wide navigation, the campus graph is decomposed into hierarchical subgraphs:

- **Campus-Level Subgraph**: Models outdoor pathways, roads, and open spaces connecting building entrances.
- **Building Subgraph**: Nodes and edges within a specific structure.
- **Floor Subgraph**: A subset of the Building Subgraph on a single floor level.
- **Inter-Floor Connectors (Stairs & Elevators)**: Edges crossing floor boundaries. These carry higher weight penalties to represent vertical physical effort.

### Spatial Resolution (Nearest-Node Snapping)

When coordinates are received from **GPS (outdoors)** or a **QR Code (indoors)**, the spatial matching engine snaps to the nearest node:

$$v_{start} = \arg\min_{v \in V_{sub}} \text{distance}(P, v)$$

## Key Differentiators

| vs. Google Maps | vs. Other Campus Apps | vs. Static Maps |
|----------------|----------------------|----------------|
| Campus-specific POIs | Component-based editor | Interactive routing |
| Indoor floors + 360° | Auto-generated directory | GPS + QR positioning |
| Admin-controlled data | Graph as source of truth | Real-time path calculation |
