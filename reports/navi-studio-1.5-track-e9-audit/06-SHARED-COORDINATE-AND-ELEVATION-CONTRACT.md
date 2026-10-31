# Shared Coordinate and Elevation Contract

1. Keep WGS84 lat/lng as geographic input.
2. Define campus-local projected meter frame: CRS ID, origin, axes and transform version. Grid coordinates use it; reuse `CoordinateTransformer` or a core companion, never planar degrees.
3. One campus vertical datum: stable ID, named zero reference, meters and authored-not-surveyed status. Samples are finite offsets or explicit no-data; zero is not missing.
4. Preserve current semantics: `Building.baseElevation` is MSL; `Floor.elevation` is relative to building base. Neither auto-converts to terrain Z. `CampusElevation` exists but is not yet active on these entities.
5. Renderer may use a local relative origin for precision without changing authored values.
6. Navigation nodes/edges need explicit Z/level and connector semantics. Do not silently drape routes onto mesh.

Validate finite values, dimensions, bounds, caps, CRS/datum, version and checksums. Reject corrupt/unsupported surfaces; never silently substitute flat zero. MSL-to-campus conversion remains unresolved for foundations absent a known transform.
