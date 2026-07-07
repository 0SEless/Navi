---
tags: [#role/architect, #status/planning]
date: 2026-06-20
title: "ADR-007: Image Storage Strategy — Cloudinary"
---

# ADR-007: Image Storage Strategy — Cloudinary

## Status
Proposed

## Context
NAVI needs image storage for:
- 360° panoramas (large equirectangular images)
- Building photos
- Floor plan uploads
- Admin UI assets

Images must be fast to load, optimized for mobile, and not lock NAVI to one provider.

## Decision
1. **Cloudinary CDN** for all images (confirmed in earlier decisions: portable URLs, 25 GB free tier).
2. **Upload widget**: Cloudinary Upload Widget (pre-built UI, no custom upload code).
3. **Image transforms**: Use Cloudinary URL parameters for responsive srcsets (`w_200`, `w_400`, `w_800`).
4. **Fallback during development**: Data URLs and local file uploads until Cloudinary account is active.
5. **No Supabase Storage**: Cloudinary URLs are portable; Supabase Storage would create vendor lock-in.

## Alternatives Considered
- **Supabase Storage**: Tight integration but vendor lock-in → rejected.
- **AWS S3 + CloudFront**: More setup, not free → overkill.
- **Local files**: Don't persist across deployments → rejected.

## Consequences
- Cloudinary account must be created (free tier).
- Upload widget API key exposed in client (Cloudinary's model — safe for unsigned uploads with upload preset restrictions).
- Panorama images should be max 4096x2048 to keep free tier usage low.

## Links
- [[cloudinary-integration]]
- [[full-system-plan]]
