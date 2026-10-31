# Resolution and Performance Analysis

No E9 benchmark was run. Counts below are planning estimates. Formula: `(floor(W/s)+1)×(floor(H/s)+1)`. At 5 m: 500 m square ~10,201 samples/~40.8 KB Float32; 1 km square ~40,401/~161.6 KB. At 2 m: ~63,001/~252 KB and ~251,001/~1 MB. Masks, metadata, JSONB, transport, history and GPU buffers add overhead. A 5 m 201×201 grid has ~79,202 triangles; a 10 m 1 km overview has ~10,201 samples. Alignment changes counts.

Benchmark synthetic 0.25/1/4 km² at 10/5/2 m: cold/warm load; dirty-tile stroke p50/p95 latency; command/history bytes; IndexedDB save/recovery; scope bytes; explicit-save latency; WAL/checkpoint growth; checksum/undo/redo; GPU memory and frame rate on supported mobile/desktop. Include sparse/dense edits. No figures here claim measured performance.

One terrain scope replaces full terrain content; PostgreSQL checkpoints full campus state every 25 revisions by default. Set byte/latency/recovery caps and a measured threshold for tile revisions. Tile scopes require atomic manifest/checksum semantics to prevent partial surfaces.
