# Synthetic storage and checkpoint measurements

Fixture: deterministic JSON for 24 buildings, 700 routing segments, and 500 terrain contours. Byte sizes below are UTF-8 serialized JSON in the test fixture, not PostgreSQL storage measurements.

| Measure | Bytes |
| --- | ---: |
| Full synthetic campus per revision | 140,726 |
| Selected building scope | 1,836 |
| Routing scope | 49,117 |
| Terrain scope | 47,454 |
| Representative one-each scope set | 98,407 |
| 20 full-campus history payloads | 2,814,520 |
| 20 evenly distributed scoped payloads | 688,849 |

The scoped fixture used 75.5% fewer serialized history bytes than repeated full-campus payloads. The adapter test used a configurable checkpoint interval of 5 and created checkpoints at revisions 0, 5, 10, 15, and 20. For reconstruction of revision 19, the modeled operation replay counts at intervals 5, 10, and 20 are 4, 9, and 19. The interval-5 simulated reconstruction took about 53 ms in this run; this timing is machine- and test-run-dependent.

These numbers exclude JSONB representation, TOAST, indexes, WAL, vacuum, network, disk, and query planning. They justify keeping the interval configurable and using 5 only as a synthetic starting point; they are not a database benchmark. Exact run output is in `logs/adapter-efficiency-vitest.log`.
