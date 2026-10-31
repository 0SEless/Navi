# Terrain Dependency Contract

Terrain is an immutable, versioned campus asset. C2 creates no upload path, bucket, or asset. A terrain commit stores metadata and a reference to an already verified asset version; the file itself is uploaded only in a future separately approved step.

## Required metadata

```json
{
  "assetId": "<stable-id>",
  "assetVersionId": "<immutable-version-id>",
  "contentChecksum": "<sha256-of-exact-object-bytes>",
  "mediaType": "image/tiff",
  "byteLength": 0,
  "horizontalCrs": { "authority": "EPSG", "code": 0, "wkt": "<canonical CRS definition>" },
  "verticalDatum": "<named datum or documented local benchmark>",
  "units": { "horizontal": "m", "vertical": "m" },
  "coverage": { "type": "Polygon", "coordinates": [] },
  "resolution": { "horizontalMeters": 0, "verticalMeters": 0 },
  "dimensions": { "width": 0, "height": 0, "bands": 1 },
  "noDataValue": null,
  "provenance": { "source": "<provider/survey>", "sourceId": "<optional>", "capturedAt": "<ISO-8601>", "processing": "<pipeline/version>" }
}
```

The creating workflow must require a named, reviewable datum (or documented local benchmark) before accepting a terrain asset. Never assume vertical datum from a horizontal CRS.

Validate that `assetVersionId` never mutates in place; checksum is over uploaded bytes; CRS authority/code and canonical WKT agree; units are explicit; coverage intersects the campus boundary; resolution and dimensions are positive and consistent with coverage; no-data semantics are defined; and provenance captures source and processing lineage. Reject silent reprojection or vertical conversion; represent each derived raster as a new immutable version with transformation metadata.

## Dependency and invalidation rules

- Road surface, path elevation, and building foundation/entrance elevation consume exact terrain asset-version IDs and checksums.
- A building/routing candidate that references terrain includes a required dependency `(terrain scope ID, terrain revision, checksum)`.
- If the active terrain version changes after capture, dependent commits fail with `DEPENDENCY_CONFLICT`; a missing referenced asset fails with `DEPENDENCY_MISSING`.
- Terrain replacement does not silently rewrite existing roads or foundations. A new terrain version and explicit reviewed road/foundation recomputation produce new dependent revisions.
- Buildings/entrances that do not use terrain do not acquire a synthetic dependency.

Store object bytes in a private environment-specific bucket/account. Use server-minted short-lived upload authorization scoped to one generated key; verify exact size, content type, checksum, and ownership before marking a version active. A client must not choose another campus’s object key. This contract must use Dev storage isolated from Production; current `navi-dev-studio` Preview key inventory did not include R2 variables, and Supabase reported no Storage buckets. No upload was attempted.
