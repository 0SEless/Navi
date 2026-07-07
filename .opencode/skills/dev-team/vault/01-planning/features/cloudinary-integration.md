---
tags: [pm, status/in-progress]
created: 2026-06-20
complexity: M
---

# Feature: Cloudinary Integration

## Summary
Set up Cloudinary as the image CDN for NAVI, including MCP server for AI-assisted management, skills for image operations, and upload wiring for floor plans, building photos, and panoramas.

## Problem Being Solved
Image uploads (floor plans, building photos, 360° panoramas) are currently placeholders with no real backend. Cloudinary provides upload widgets, transformations, CDN delivery, and AI-assisted management via MCP.

## Acceptance Criteria
- [ ] Given the Cloudinary MCP is configured, when an AI tool needs to upload or transform an image, then it can do so via the MCP protocol
- [ ] Given Cloudinary skills are installed, when generating image-related code, then the AI uses Cloudinary best practices
- [ ] Given a user is in MapEditor, when they upload a floor plan, then the image uploads to Cloudinary and the URL is stored on the Building
- [ ] Given a user is in PanoramaManagement, when they upload a panorama photo, then the image uploads to Cloudinary and the URL is stored on the Node

## Out of Scope
- Video uploads (Cloudinary supports them, but NAVI doesn't need them yet)
- Advanced image transformations (resize/crop can be added later)
- Cloudinary backups

## Tasks
- [ ] [ARCH] Write ADR for Cloudinary MCP architecture and security
- [ ] [DEV] Add `cloudinary` entry to `.opencode/opencode.json` under `mcp` with remote type
- [ ] [DEV] Install Cloudinary skills via `npx skills add cloudinary-devs/skills`
- [ ] [DEV] Add Cloudinary env vars to `.env.local`
- [ ] [DEV] Wire Cloudinary upload widget in MapEditor floor plan section
- [ ] [DEV] Wire Cloudinary upload widget in PanoramaManagement page
- [ ] [QA] Test floor plan upload flow end-to-end
- [ ] [QA] Test panorama upload flow end-to-end
- [ ] [DEVOPS] Document env vars in runbook
- [ ] [DOCS] Write Cloudinary integration guide

## Dependencies
- Blocked by: [[supabase-mcp-integration]] (env vars and DB schema come first)
- Blocks: public map with panorama viewer

## Estimate
Complexity: M
Reasoning: Multiple touchpoints — MCP config, skill installation, env vars, two upload UI integrations.
