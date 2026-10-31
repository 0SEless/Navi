# Track D4.1 — Docker Inventory

## Pre-run inventory

docker info: Engine 29.8.1, Linux, 0 containers, 2 images, 7,215,038,464 bytes memory (~6.72 GiB). Disk C: had 15,554,883,584 bytes free (~14.49 GiB). No TCP listener on 5432, 55432, 2375, or 2376.

docker ps -a was empty. Existing images:
- postgres:17-alpine, image ID sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24, 424 MB.
- hello-world:latest, image ID sha256:5e23090353324d887c48ad5e5c56d294eab81588df9605b07d1afe895f9cc8f8, 25.9 kB.

Seven pre-existing anonymous local volumes were present and left untouched:
5bb60f82df97269485a2617786f7bd2b21f079d27920534e18b352ed896d3118,
7a29ea5c0dda11e41b66b2c608c523dbdaa7b34287b19ce88665588de5e356cb,
6304579b7b342d22367470f5e77c583612e026620095ae1f2dae69331bb2e893,
417824145d487190c7db55d6ad90b2a6bd981b6e7c64b42e8db4013c5431b4ce,
bb8ee4110e1e0a03b61df70b6c304b74f5cdf534021915817bb64dd4f7966719,
e0e4e03133738fbfe641620778c43afb4bd95ddcae9e571bf7f8e2a25aed8e36,
e71603b99426a3ea72b3d601a6af1ecc831f721b293753b0736f0de196649035.

Only built-in bridge, host, and none networks existed. The dedicated NAVI container/volume/network names were unused.

## Post-run inventory

- Container navi-d2-synthetic-postgis17, ID 33f738e498240f4cd470c7fc6a391370db11d79ccaaf5af8fabb3d1f6c29ff4c; image postgis/postgis:17-3.6, image ID sha256:1ac10b2551ba84ae05db8e7da477afcd0a3fede99bcb7705da2ee157390cb095; state running / healthy; restart policy no.
- Compose project navi-d2-synthetic; one dedicated volume navi-d2-synthetic-postgis17-data, mounted at /var/lib/postgresql/data.
- One dedicated bridge network navi-d2-synthetic-isolated, internal=true; no external gateway.
- Image size reported by Docker: 954 MB; image metadata identifies PostGIS 3.6.4 and PostgreSQL 17.
- Docker after run: 1 container, 3 images, memory 7,215,030,272 bytes.
- C: free space after image pull and artifacts: 14,187,737,088 bytes (~13.21 GiB).

The container host mapping is configured for 127.0.0.1:55432 to container port 5432. However, docker ps displayed only 5432/tcp, docker inspect showed HostConfig.PortBindings set but NetworkSettings.Ports empty, docker port returned no active mapping, and TCP connection to 127.0.0.1:55432 failed. No external host port was observed listening. Do not rely on host TCP access until this discrepancy is resolved.

The image, one container, one named volume, and one named network are the only Docker resources created by this run. No unrelated container, image, volume, or network was changed.
