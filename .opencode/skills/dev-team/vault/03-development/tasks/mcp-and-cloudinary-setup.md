---
tags: [developer, status/done]
feature: "[[supabase-mcp-integration]]"
feature: "[[cloudinary-integration]]"
date: 2026-06-20
---

# Task: MCP Server Configuration + Cloudinary Upload Wiring

## Approach
Configured Supabase and Cloudinary as remote MCP servers in `.opencode/opencode.json`, added Cloudinary environment variables, and wired basic file upload UI in MapEditor and PanoramaManagement pages.

## Files Changed
| File | What changed | Why |
|------|--------------|-----|
| `.opencode/opencode.json` | Added 4 MCP entries: supabase, cloudinary-asset-mgmt, cloudinary-env-config, cloudinary-smd | Integration of AI-accessible database + media management |
| `navi-next/.env.local` | Added 4 Cloudinary env vars + SUPABASE_PROJECT_REF | Required for MCP auth and upload widget |
| `navi-next/src/components/pages/MapEditor.tsx` | Added floor plan file selection state + handler | Wires the upload UI in building properties panel |
| `navi-next/src/app/(admin)/panoramas/page.tsx` | Added image upload to panorama cards with preview | Enables panorama image selection per node |

## Key Decisions
- **Remote MCP** over local — no npm dependencies, simpler setup, OAuth support
- **Supabase MCP scoped** with `project_ref` env var for safety
- **Cloudinary MCP uses API key auth** via `cloudinary-url` header for CI compatibility
- **File input upload** (not Cloudinary widget) for MVP — reduces setup friction, actual Cloudinary upload widget can replace once account is set up
- Panorama images stored as data URLs in node metadata for dev (will switch to Cloudinary URLs in production)

## Known Limitations / Tech Debt
- Floor plan upload stores file name only — actual upload to Cloudinary needs real env vars
- Panorama upload uses `FileReader` data URLs — temporary for development
- Cloudinary skills (`npx skills add cloudinary-devs/skills`) failed to install (git not available on Windows)
- `panoramaUrl` is not in the `NavNode` type — uses `Record<string, unknown>` cast

## QA Handoff Notes
- Test that floor plan file selection shows the file name in MapEditor
- Test that panorama upload shows image preview
- No actual Cloudinary upload happens until env vars are configured

## DevOps Handoff Notes
- New env vars: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, `SUPABASE_PROJECT_REF`
- MCP servers require OAuth login or API key setup before they connect
