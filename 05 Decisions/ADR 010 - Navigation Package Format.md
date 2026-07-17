# ADR 010: Navigation Package Format

**Status:** Accepted
**Date:** 2026-07-17
**Author:** opencode Architecture Agent

## Context

ADR-009 defined the compiler pipeline that transforms `CampusDocument` into `NavigationArtifacts` — an in-memory bundle of graph, search index, spatial index, building index, and POI data. The compiler produces these artifacts as part of its `CompileResult`, but they remain an **internal compiler concept**.

The project has three products:

- **NAVI Studio** (authoring) — produces `CampusDocument`
- **Compiler** — transforms documents into navigation data
- **NAVI App** (navigation experience) — consumes published navigation data

For the NAVI App to consume compiler output without depending on compiler internals, a **stable, versioned, self-contained package format** must be defined between the compiler and the runtime. This format is the deployment contract — the publisher writes it, the runtime loads it, and either side can evolve independently as long as the format remains backward-compatible.

This ADR defines **what** a navigation package is. It does not define **how** packages are created (that is the Publisher's responsibility, covered in a future ADR). The separation follows the same philosophy as ADR-009: the format is the contract; the implementation is the mechanism.

### Layer boundaries

```
CampusDocument       ← ADR-006, authored in Studio
      │
      ▼
NavigationArtifacts  ← ADR-009, produced by Compiler (internal, typed, in-memory)
      │
      ▼
NavigationPackage    ← ADR-010, written by Publisher (stable, versioned, on-disk)
      │
      ▼
LoadedPackage        ← future ADR, consumed by Runtime
```

Each boundary is a formal contract. The compiler does not know about files or directories. The runtime does not know about TypeScript interfaces. The package format is the bridge.

**Important:** `NavigationPackage` is the **transport/storage format** — the on-disk representation. The runtime does not consume raw JSON files directly. A future ADR (Runtime Loader, ADR-012) defines `LoadedPackage`, the deserialized in-memory form that the runtime engine operates on. The publisher writes `NavigationPackage`; the loader reads it and produces `LoadedPackage`. The package format is the permanent serialization contract between them.

## Decision

### 1. Package Layout

A `NavigationPackage` is a directory with a well-known set of files:

```
campus-id/
├── campus.nav.json          # Package manifest (required)
├── graph.nav.json            # Navigation graph (required)
├── search.nav.json           # Search index (optional)
├── spatial.nav.json          # Spatial index (optional)
├── building.nav.json         # Building index (optional)
└── poi.nav.json              # POI index (optional)
```

The manifest is always required. All other artifacts are optional — a campus may omit the spatial index (GPS-denied indoor environment) or search index (no search metadata). The manifest declares which artifacts are present.

The directory name matches the `campusId`. The parent directory is the publisher's concern.

### 2. Manifest (`campus.nav.json`)

The manifest is the entry point of every package. It declares which artifacts exist, their checksums, their schema versions, and top-level metadata.

```typescript
interface NavigationPackageManifest {
  /** Schema version of the manifest format itself. Semver. */
  schemaVersion: string

  /** Unique identifier for this campus. Matches CampusDocument.id. */
  campusId: string

  /** Human-readable campus name. */
  campusName: string

  /** ISO 8601 timestamp of publication. */
  publishedAt: string

  /** Compiler version that produced the source artifacts. */
  compilerVersion: string

  /** Revision identifier from the source document. */
  revision: string

  /** Declared artifacts present in this package (keyed by artifact name). */
  artifacts: Record<string, PackageArtifact>

  /** Top-level package metadata. */
  metadata: PackageMetadata
}

interface PackageArtifact {
  /** Relative path from the package root. */
  path: string

  /** SHA-256 hex checksum of the file contents. */
  checksum: string

  /** File size in bytes. */
  size: number

  /** Schema version of this artifact (semver). */
  schemaVersion: string
}

interface PackageMetadata {
  nodeCount: number
  edgeCount: number
  buildingCount: number
  floorCount: number
  boundingBox: BoundingBox
  routeable: boolean
}
```

### 3. Artifact Schemas

Each artifact file has a stable schema. Artifacts are versioned independently under `schemaVersion` so that one artifact can evolve without affecting others.

#### 3.1 Navigation Graph (`graph.nav.json`)

The routable graph. Required.

```typescript
interface NavigationGraphFile {
  schemaVersion: string
  campusId: string
  checksum: string
  nodes: NavNode[]
  edges: NavEdge[]
}

interface NavNode {
  id: string
  type: 'waypoint' | 'poi' | 'transition' | 'outdoor' | 'entrance'
  lat: number
  lng: number
  floor: number
  buildingId: string
}

interface NavEdge {
  id: string
  from: string
  to: string
  type: 'walk' | 'stairs' | 'elevator' | 'escalator' | 'ramp' | 'transition'
  distance: number
  weight: number
}
```

- `lat`/`lng` are flat fields (not `{lat, lng}` objects) for smaller serialization.
- `buildingId` is always set. Outdoor nodes use `__outdoor__`.
- `weight` may differ from `distance` (for policy-based routing). Defaults to `distance`.

#### 3.2 Search Index (`search.nav.json`)

Maps human-readable labels to graph node IDs. Optional.

```typescript
interface SearchIndexFile {
  schemaVersion: string
  entries: SearchEntry[]
}

interface SearchEntry {
  id: string
  label: string
  type: 'building' | 'room' | 'entrance' | 'poi'
  nodeId: string
  lat: number
  lng: number
  tags: string[]
  buildingId?: string
  floor?: number
}
```

- `label` is the display text (e.g., "Room 204", "Engineering Building").
- `tags` enable partial/fuzzy matching (e.g., `["204", "classroom", "second floor"]`).
- `nodeId` links directly to the graph for routing.

#### 3.3 Spatial Index (`spatial.nav.json`)

A spatial hash for nearest-node queries. Optional.

```typescript
interface SpatialIndexFile {
  schemaVersion: string
  cellSize: number             // degrees per cell side
  cells: Record<string, string[]>  // cell key → NavNode IDs
}
```

- Cell keys are `floor:cellX:cellY`.
- The runtime loads this into an in-memory spatial hash for GPS snapping.
- `cellSize` is configurable during compilation (default: 0.001° ≈ 100m).

#### 3.4 Building Index (`building.nav.json`)

Per-building metadata including floors, entrances, and floor plan URLs. Optional.

```typescript
interface BuildingIndexFile {
  schemaVersion: string
  buildings: BuildingEntry[]
}

interface BuildingEntry {
  id: string
  name: string
  code: string
  position: { lat: number; lng: number }
  floors: FloorEntry[]
  entrances: EntranceEntry[]
  floorPlanUrls?: Record<number, string>  // level → image URL
}

interface FloorEntry {
  level: number
  label: string
  nodeIds: string[]
}

interface EntranceEntry {
  id: string
  label: string
  nodeId: string
}
```

- `nodeIds` on `FloorEntry` allows the runtime to filter the graph to a single floor.
- `floorPlanUrls` is optional — present only when floor plan images were uploaded.
- `entrances` are graph-linked so the runtime can compute entrance → destination routes.

#### 3.5 POI Index (`poi.nav.json`)

Points of interest with categories. Optional.

```typescript
interface POIIndexFile {
  schemaVersion: string
  points: POIEntry[]
}

interface POIEntry {
  id: string
  label: string
  category: string
  lat: number
  lng: number
  nodeId: string
  buildingId?: string
  floor?: number
  properties: Record<string, unknown>
}
```

- `category` is an open string: `'room'`, `'panorama'`, `'qr_marker'`, `'landmark'`, `'restroom'`, `'elevator'`, etc.
- `properties` carries arbitrary additional data (room capacity, wheelchair accessible, department name).

### 4. Versioning

The package has no single version number. Each artifact declares its own `schemaVersion` (semver), and the manifest has its own `schemaVersion`. This allows independent evolution.

#### 4.1 Compatibility rules

| Change | Version bump | Runtime behavior |
|--------|-------------|-----------------|
| Adding a new artifact type | Minor (manifest) | Ignored by older runtimes |
| Adding an optional field to an artifact | Minor (artifact) | Ignored by older runtimes |
| Adding a required field to an artifact | Major (artifact) | Old runtime rejects |
| Removing a field from an artifact | Major (artifact) | Old runtime rejects |
| Changing the manifest structure | Major (manifest) | Old runtime rejects entire package |

The runtime loads artifacts it understands and skips artifacts whose `major` version it does not support.

#### 4.2 Determinism

All artifact content is deterministic given identical input. Same `NavigationArtifacts` in → same artifact JSON bytes out. The manifest's `publishedAt` timestamp is the only non-deterministic field — it is excluded from the manifest checksum so that two publishes of identical input produce identical content checksums. This enables content-addressed caching and CDN deduplication.

### 5. File Naming Convention

All package files use the `.nav.json` extension:

| File | Content-Type |
|------|-------------|
| `campus.nav.json` | `application/vnd.navi.package-manifest+json` |
| `graph.nav.json` | `application/vnd.navi.navigation-graph+json` |
| `search.nav.json` | `application/vnd.navi.search-index+json` |
| `spatial.nav.json` | `application/vnd.navi.spatial-index+json` |
| `building.nav.json` | `application/vnd.navi.building-index+json` |
| `poi.nav.json` | `application/vnd.navi.poi-index+json` |

The `.nav.json` extension distinguishes these from generic JSON files and enables content-type detection in web servers and CDNs.

### 6. Package Invariants

1. **Every package has exactly one manifest.** `campus.nav.json` is always present. Without it, the directory is not a valid package.

2. **Every artifact listed in the manifest exists and matches its checksum.** The runtime MUST verify checksums on first load. Failure = `LoadError.CHECKSUM_MISMATCH`. The format **enables** partial-publish detection (missing or mismatched checksum), but **atomic writing** is the publisher's responsibility — the publisher must ensure that a package directory contains either all files with correct checksums or is rejected entirely.

3. **Artifact files are never modified after publication.** A package is immutable. A new publication produces a new package directory. No in-place updates.

4. **Artifacts are JSON.** No binary formats in the base specification. Binary formats may be added later as an optimization.

5. **Every NavNode has a defined `floor` value.** Floor 0 is ground. Negative floors are basements. Floors need not be contiguous.

6. **Every NavEdge references valid node IDs.** No dangling `from`/`to` references within a package.

7. **`buildingId` is always set on every node.** Outdoor nodes use `__outdoor__`. No empty-string or undefined `buildingId` appears in the published format.

8. **Coordinates are WGS84 decimal degrees.** No other coordinate systems appear in the published format. All coordinate conversion happens in the compiler.

9. **A package is self-contained.** It does not reference external files or URLs (except `floorPlanUrls` which are display-only and not required for routing).

10. **The package format does not constrain how packages are created, stored, or distributed.** Those concerns belong to the Publisher and the Runtime Loader.

### 7. Non-Concerns (Explicitly Out of Scope)

This ADR does **not** define:

- **How packages are created.** The publisher (future ADR) will define how `NavigationArtifacts` are serialized into package files. This includes atomic write strategy, checksum computation, and the order of operations.
- **How packages are distributed.** CDN, Supabase storage, file download, offline cache — these are deployment decisions, not format decisions.
- **How packages are loaded.** The runtime loader (future ADR) will define manifest parsing, checksum verification, artifact deserialization, and schema compatibility checks.
- **How packages are versioned at the distribution level.** Versioning of package directories (tags, branches, semver ranges) is a deployment concern.
- **How packages are bundled for mobile.** ZIP archives, tarballs, or app bundles are distribution wrappers, not format changes.

Keeping these out of scope ensures the format remains stable regardless of how it is produced or consumed.

## Consequences

### Positive

- **Clear deployment boundary.** The compiler produces in-memory `NavigationArtifacts`; the publisher serializes them; the runtime deserializes them. Each layer has its own contract, and none depends on another's internals.
- **Independent artifact versioning.** Fields can be added to one artifact without changing others. The runtime can load what it understands and skip the rest.
- **Immutable packages.** Once published, a package never changes. This enables CDN caching, checksum verification, offline distribution, and rollback.
- **Runtime never imports compiler types.** The runtime loads JSON. No TypeScript dependency on `@navi/compiler`. This enforces ADR-008's architectural boundary.
- **Checksum verification catches corruption.** Transport errors, disk failures, and partial writes are detected before the runtime uses any data.
- **Optional artifacts.** A campus without spatial search (GPS-denied indoor environment) omits `spatial.nav.json`. The manifest reflects what's available.
- **Human-readable debugging.** JSON is inspectable. A developer can open `graph.nav.json` in any editor and verify node positions.

### Negative

- **File size.** JSON is larger than binary formats. Binary encoding (MessagePack, CBOR, flatbuffers) may be needed later for mobile distribution.
- **Multiple files.** Five artifact files + one manifest = six files per package. A distribution wrapper (ZIP, tarball) may be added later for convenience.
- **Checksum verification adds load time.** The runtime must compute SHA-256 over every artifact on first load. This is a one-time cost per campus.
- **No incremental updates.** Replacing a single artifact requires republishing the entire package. Acceptable for whole-campus publications; may need revisiting for live updates.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Single JSON file | Simpler distribution; one checksum | Large monolithic file; no partial loading | Multi-file enables CDN caching per artifact |
| Binary format (MessagePack, CBOR) | Smaller files; faster parsing | Not human-readable; harder to debug | JSON first, binary as future optimization |
| SQLite package | Single file; queryable; transactional | Heavy dependency; read-only data doesn't need transactions | Over-engineered for read-only navigation data |
| No package format (runtime imports compiler) | No serialization step | Runtime coupled to compiler types | Violates ADR-008's architectural boundary |
| ZIP archive | Single file; compression | Adds extraction step; can't HTTP-range-request per artifact | Multi-file directory is simpler; ZIP is a distribution wrapper, not a format change |
| Inline checksums in each file | Self-verifying artifacts | Duplicates manifest data | Manifest is the single source of truth for package integrity |

## Related

- Depends on: ADR-009 (Compiler Pipeline) — the compiler produces the `NavigationArtifacts` that the package format captures
- Enables: ADR-011 (Publisher) — will define how `NavigationArtifacts` → `NavigationPackage`
- Enables: ADR-012 (Runtime Loader) — will define how `NavigationPackage` → loaded runtime state
- Referenced by: future ADRs on Publisher and Runtime Architecture
