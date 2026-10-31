# 3D Preview Technology Assessment

No prototype/package installation was performed.

| Option | Fit | Tradeoff |
|---|---|---|
| MapLibre raster DEM | Raster-tile runtime | Needs DEM/tile pipeline; not editable grid storage |
| MapLibre custom WebGL | Shared camera | GPU/shader lifecycle complexity and coupling |
| Isolated Three.js canvas | Direct mesh buffers/separate camera | New dependency, controls/accessibility/lifecycle |
| React Three Fiber | Declarative React scene | Additional packages; not present in inspected dependencies |

Recommendation: retain MapLibre 2D; after owner approval prototype a small separate Three.js preview for derived mesh. Update changed tile buffers, cap pixel ratio, dispose resources, handle context loss and provide accessible 2D fallback. Benchmark 1 km² synthetic mobile/desktop frame rate, GPU memory, load/update and fallback before final selection. Renderer is never authoring data source.
