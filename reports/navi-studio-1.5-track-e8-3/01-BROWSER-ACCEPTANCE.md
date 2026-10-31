# Track E8.3 — Browser Acceptance

## Actual editor-to-E5 workflow

Playwright passed on synthetic campus `navi-e8-browser-46b34be9990b4617`. The route edit was made through Floor Editor navigation controls; the atomic edit used Studio building and road controls. The browser used the synthetic authenticated global-admin fixture and local `/api/studio/scoped-save` endpoint. No real identity provider or Supabase was contacted.

| Campus revision | Editor action and committed scopes | Operations | Receipts | Change sets | Reconstructed checksum |
|---:|---|---:|---:|---:|---|
| 1 | Delete Library route node; `routing:e8-building-library` | 1 | 1 | 1 | `b3a130230e8f4d140813add05b257bdd2d6f38dafbe56e01d28e1a9dbe310ce1` |
| 2 | Atomic Library rename plus campus road routing edit; `building:e8-building-library`, `routing:navi-e8-browser-46b34be9990b4617` | 2 | 2 | 1 | `133b6c5a8607923fca29d3c1f0bf66a56befb208aad3baca5c6a65c64f1c1865` |
| 3 | First concurrent writer wins Library edit; `building:e8-building-library` | 1 | 1 | 1 | `8f470ac8bc7d1f282fa37fcd5269856ece93bbe39c5ddc583b67bfa9e1784fc7` |
| 4 | Lost acknowledgment commits the older Lab edit; exact retry replays it; `building:e8-building-lab` | 1 | 1 | 1 | `1baa7319689cb5eb4b47c6f4b17378c531deef10cc34e6cec521c9d2aae309ab` |
| 5 | Later Lab edit remains independently saveable; `building:e8-building-lab` | 1 | 1 | 1 | `910de4377b6442ab7f7c4419b84a70051745103b417cd7d6a95516676f58b285` |

The stale writer received HTTP 409 and kept its Lab draft in IndexedDB. After closing and relaunching the same persistent Chromium profile, the draft appeared in the actual Studio Explorer and the durable-save status showed a conflict. The route was also reopened in a fresh context and its routing UI showed the persisted one-node route. The atomic revision recovered both edited scopes in a separate context.

At revision 5, unrelated campus-settings and terrain scopes remained at revision 0. The final campus had 6 scopes, 5 change sets, 6 operations, 6 receipts, one checkpoint, and a reconstructed checksum of `910de4377b6442ab7f7c4419b84a70051745103b417cd7d6a95516676f58b285`.

The complete Playwright flow took 33.1 seconds. No per-pointer-movement event-rate measurement was collected. Terrain has persistence representation but no usable terrain authoring control, so no terrain edit was simulated or claimed. Evidence: `logs/browser-46b34be9990b4617/playwright.log` and `postgres-verify-final.log`.
