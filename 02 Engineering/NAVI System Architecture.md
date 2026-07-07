# NAVI System Architecture

Source: `C:\Users\Administrator\Downloads\NAVI_Project_Docs\SYSTEM_ARCHITECTURE.md`

## Platform Direction

NAVI is a reusable multi-campus navigation platform. Each campus has its own map settings, buildings, directory data, route graph, QR locations, panoramas, admins, and analytics.

## System Flow

```text
Mobile Application
  -> User Interface
  -> Navigation Engine
  -> API Gateway
  -> Backend Services
  -> Database + Storage
```

## Updated Platform Flow

```text
Flutter Mobile App
  -> Node.js + Express API
  -> Navigation and Mapping Services
  -> PostgreSQL + PostGIS
  -> Object Storage for panoramas and images
  -> SQLite offline cache on device
```

## Modules

### Campus Management Service

- Campus onboarding
- Campus profile and boundaries
- Campus-scoped admin access
- Multi-campus data isolation

### Navigation Service

- Route generation
- Turn-by-turn instructions
- Outdoor-to-indoor route transitions
- Route graph traversal using nodes and edges

### Map Provider Service

- OpenStreetMap/Mapbox-compatible map settings
- Campus map center, zoom, style, and boundary
- Provider abstraction so NAVI is not locked to one map provider

### Indoor Navigation Service

- Panorama viewer
- Hotspot management
- Floor, room, entrance, and indoor route support

### Mobile Route Visualization Service

- Animated 2D route line from current or selected start point to destination
- Outdoor campus map and indoor floor map route display
- Destination marker, progress state, and turn-by-turn support

### Information Service

- Building profiles
- Department profiles
- Faculty directory

### Mapping Service

- Path recording
- Route editing
- Node management

### Analytics Service

- Usage reports
- Popular destinations
- Per-campus navigation and search metrics

## Key Architecture Rules

- Every campus-owned record should include `campus_id`.
- Map rendering should read campus-specific map settings.
- Route calculation should use route nodes and route edges.
- QR codes should resolve to precise route nodes, not only buildings.
- Panoramas and building images should live in object storage, not directly in PostgreSQL.

## Links

- [[NAVI Project Requirements]]
- [[NAVI Database Design]]
- [[NAVI UI UX Pro Max Workflow]]
- [[NAVI Platform Upgrade Plan]]
- [[ADR 001 - Multi Campus Platform]]
- [[ADR 003 - Mobile 2D Route Animation]]
