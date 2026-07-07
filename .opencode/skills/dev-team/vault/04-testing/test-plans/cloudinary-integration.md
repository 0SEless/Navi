---
tags: [qa, status/done]
feature: "[[cloudinary-integration]]"
date: 2026-06-20
---

# Test Plan: Cloudinary Integration

## Scope
Testing Cloudinary MCP server configuration, environment variables, and upload UI wiring in MapEditor and PanoramaManagement.

## Test Cases
| ID | Scenario | Input / Setup | Expected Output | Type | Priority |
|----|----------|---------------|-----------------|------|----------|
| TC-001 | MCP configs are valid JSON | Open `.opencode/opencode.json` | 3 Cloudinary MCP entries parse correctly | static | P0 |
| TC-002 | Cloudinary MCP URLs correct | Check `url` values | Use `/mcp` endpoints for asset-mgmt, env-config, smd | static | P0 |
| TC-003 | API key auth configured | Check `headers` on each MCP entry | Uses `cloudinary-url` or individual header pattern | static | P0 |
| TC-004 | Env vars in `.env.local` | Read file | Has `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | static | P0 |
| TC-005 | MapEditor floor plan select | Click upload area in building properties | File picker opens, file name displays after selection | manual | P1 |
| TC-006 | MapEditor floor plan replace | Click "Replace file" after selection | Returns to empty upload state | manual | P1 |
| TC-007 | Panorama upload | Click upload on a panorama card | File picker opens, image preview displays | manual | P1 |
| TC-008 | Panorama image preview | Upload an image | Card shows thumbnail of uploaded image | manual | P1 |
| TC-009 | Panorama replace | Upload second image on same card | New image replaces old preview | manual | P2 |

## Edge Cases Checklist
- [x] Floor plan upload with no building selected — handler guards with early return
- [x] Panorama upload on non-existent node — handled by store update
- [x] Large file sizes — browser handles (no server-side validation yet)
- [x] Invalid file types — restricted by `accept` attribute

## Definition of Done
- [x] All P0 static checks pass
- [x] All P1 manual tests verified in browser (pending env var config for real Cloudinary upload)
