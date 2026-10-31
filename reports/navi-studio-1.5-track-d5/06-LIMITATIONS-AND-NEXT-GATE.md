# Track D5 — Limitations and Next Gate

## Current result

The local encryption test passed on a fabricated existing D4.1 dump. The required fresh synthetic database export, encrypted-dump restore into a new empty database, and restored data-integrity comparison did not run because Docker Desktop could not start its Secrets Engine. No claim is made that D5's local recovery infrastructure gate passed.

## Next technical gate

After Docker startup is repaired through an owner-authorized path, first capture a new live inventory and check disk/port conflicts. Then reuse the reviewed D2 synthetic scripts and isolated Compose project, avoid touching unrelated resources, produce a fresh synthetic dump, run the persistent encryption/key recovery workflow, decrypt and verify hashes, restore into a new empty synthetic database, and compare object/data manifests. Record exact PostgreSQL/PostGIS versions. Keep localhost-only port binding; container-only `docker exec`/`docker cp` remains an acceptable tested method if host publishing is still unavailable.

## Key and artifact limits

The test key is encrypted with Windows DPAPI `CurrentUser`; recovery was tested in a separate process under the same Windows account and profile. That does not prove recovery on another host/account or after profile/master-key loss. Production key custody requires an independently recoverable approved mechanism. The original D4.1 plaintext synthetic dump remains unchanged as historical evidence; the D5 decrypted staging copy was removed.

## Explicitly not done

No Supabase export/write, migration, Vercel change, GitHub push, deployment, Production operation, Docker factory reset, Docker internal socket repair, or unrelated Docker resource modification. No real Development backup has been tested or certified recoverable.
