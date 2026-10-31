# Real TypeScript Adapter Results

**Status: PASS against E5 PostgreSQL 17.11.**

Installed and locked exact dev dependency `pg@8.23.1`. `npm ls pg --depth=0` verified the installed version. The focused opt-in Vitest integration test ran with the restricted `navi_e4_runner` against `127.0.0.1:55433` and passed (1 test, 1 pass).

The test exercised the real `PostgresScopedCommitStore`: initialized a synthetic campus, committed a two-scope batch, replayed the exact same batch, read current state, reconstructed revision 1, and independently queried PostgreSQL. Assertions verified revision 1, two scope heads, one change set, two operations, two mutation receipts, and two checkpoints. The synthetic campus identifier and actor are generated test-only values.

Evidence: `logs/e4-integration/integration-00980486cdcf40cc9d3305bc309ee41f/real-adapter-vitest.log`. The application routes, browser flows, Supabase, and real campus data were not connected to this adapter test.

