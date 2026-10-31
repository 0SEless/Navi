# Publish Pipeline Evidence

## Exercised sequence

1. Studio drew the synthetic terrain polygon and used the existing explicit Save control.
2. The local authenticated scoped-save endpoint acknowledged one terrain-scope commit.
3. The harness independently reconstructed the document from E5 PostgreSQL.
4. The reconstructed authoritative document was POSTed to the actual `/api/compile`; the test asserted its terrain fields exactly equal the reconstructed source values.
5. A test-only local adapter accepted that compiler response, set a separate published-bundle revision, and returned the public-campus response envelope consumed by the real NAVI app.

The local adapter avoids the real cloud-backed publishing route. It does not inject a terrain document directly into runtime state: its input is the actual compiler response. The browser observed `source: published_maps`, the expected synthetic campus ID, and terrain count `1` for revisions 1 and 2. A legacy compilation at revision 3 omitted terrain and retained one building.

## Checksums

SHA-256 values below were emitted by the final successful E2E run, campus `navi-e8-browser-bb67734817d44c04`:

| Content | Revision 1 | Revision 2 |
|---|---|---|
| Compiled artifact JSON | `268a1898a5eb841f4a7d5b2473506898ae994ce6632410f0656f16731f4a28db` | `4d1a51bc7e1df625ba6a647870f7a12cef74b48f831ed9404b5b8cd53b82f2b6` |
| Local published artifact bundle JSON | `888d881c63e19ca3ef0d46842758704c79d5ed0b6bdf00a98cfce0aa34acb976` | `3458444bff8e96342ddc4e605fea616661b2349725e3533bf337050d408fb566` |
| Terrain content (`areas` + datum) | `a24374398ed3012ffdddd47bb73f0a5d63dcc56c51d8d7fe81e1dcbb342aef77` | `98cb63f875729263198c42c28c4746d65baec323a7b0950c1c9d387598617f5a` |

Unchanged re-compilation before the second Save produced the same terrain content checksum and did not advance E5 revision 1. Revision 2 changes elevation from 3.25 m to 4.5 m and has a different checksum. The exact JSON hashes are test evidence for this local adapter; they are not a cloud publish receipt.

See `logs/run-bb67734817d44c04a63c70ded059abd0/playwright.log` for complete event and checksum records. Focused publish and artifact tests are preserved in the earlier E8.5 logs.
