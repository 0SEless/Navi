---
tags: [architect, status/accepted]
adr: "002"
date: 2026-06-20
status: Accepted
---

# ADR-002: Cloudinary MCP + Skills for Image Management

## Status
Accepted

## Context
NAVI handles three categories of images: building photos, floor plans, and 360° panoramas. These are currently placeholders. We need a CDN solution with upload widgets, transformations, and AI-accessible management tools.

Cloudinary was previously chosen over Supabase Storage (ADR implied by earlier decision log: portable URLs, no vendor lock-in). This ADR formalizes the integration method.

Key forces:
- AI agents need to upload, transform, and manage media assets programmatically
- Upload widgets needed in MapEditor (floor plans) and PanoramaManagement (panoramas)
- Cloudinary provides MCP servers for programmatic access and skills for AI-assisted coding
- Skills guide AI agents toward correct Cloudinary patterns and best practices

## Decision
Integrate Cloudinary via three complementary mechanisms:

1. **MCP Servers** (remote) — Add to `.opencode/opencode.json` for programmatic asset management:
   - `cloudinary-asset-mgmt` — Upload, search, delete, transform assets
   - `cloudinary-env-config` — Manage upload presets, transformations, webhooks
   - `cloudinary-smd` — Structured metadata fields
   
2. **Cloudinary Skills** — Install via `npx skills add cloudinary-devs/skills`:
   - `cloudinary-docs` — Documentation lookup for correct integration patterns
   - `cloudinary-transformations` — URL transformation generation
   - `cloudinary-react` — React SDK patterns (useful for future upload widget integration)

3. **Upload UI** — Use Cloudinary's unsigned upload widget in the browser:
   - MapEditor floor plan section: upload → Cloudinary URL → store on Building
   - PanoramaManagement: upload → Cloudinary URL → store on Node metadata

## Rationale
- **Remote MCP servers** avoid local npm dependencies and simplify setup
- **Skills** reduce LLM hallucination on Cloudinary APIs — the model pulls from real docs
- **Unsigned upload widget** is simplest for MVP (no signed upload preset needed initially)
- Skills + MCP together form a complete workflow: skills tell the AI *what* to do, MCP servers let it *do* it

## Consequences
### Positive
- AI agents can upload, search, and transform images programmatically
- Skills ensure generated code uses current SDK patterns (prevents deprecated API usage)
- Upload widget provides a polished user experience
- Cloudinary CDN ensures fast global delivery of panorama images

### Negative / Trade-offs
- Requires Cloudinary account creation (free tier sufficient for MVP)
- Unsigned uploads need an upload preset configured in Cloudinary dashboard
- MCP servers require OAuth or API key authentication

### Risks
- Free tier rate limits (25GB storage, 25GB bandwidth) — monitor usage
- Upload preset misconfiguration could allow excessive file sizes or types
- Cloudinary outage would break image uploads (mitigation: store URLs in Supabase, images remain accessible via CDN)

## Alternatives Considered
### Option A: Supabase Storage
Rejected by prior decision — Cloudinary URLs are portable, Supabase Storage creates vendor lock-in for images.

### Option B: Local image serving
Store images in `public/` directory. Rejected because it bloats the repo, doesn't scale, and lacks transformations or CDN.

### Option C: Only MCP servers, no skills
Rejected — skills provide essential guidance for correct SDK usage and transformation syntax, reducing implementation errors.

## Impact on Other Roles
- Developer: Install skills, configure MCP, wire upload widgets in MapEditor and PanoramaManagement
- QA: Test upload flows end-to-end with various file types and sizes
- DevOps: Document Cloudinary env vars and account setup in runbook
- Docs: Write integration guide covering upload preset setup and widget configuration
