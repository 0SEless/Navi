---
tags: [devops, runbook]
service: "Cloudinary MCP + Image Uploads"
date: 2026-06-20
---

# Runbook: Cloudinary MCP & Image Uploads

## Purpose
Manages image uploads (floor plans, building photos, 360° panoramas) via Cloudinary CDN, with AI-assisted management through MCP servers.

## Prerequisites
- Access required: Cloudinary account (free tier: 25GB storage, 25GB bandwidth)
- Tools required: Browser for Cloudinary dashboard setup
- Environment variables (all required):

## Setup
1. Create Cloudinary account at https://cloudinary.com
2. From Cloudinary Console > Settings > API Keys, copy:
   - Cloud name → `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
   - API Key → `CLOUDINARY_API_KEY`
   - API Secret → `CLOUDINARY_API_SECRET`
3. In Cloudinary Console > Settings > Upload > Upload Presets:
   - Create unsigned upload preset named `navi_unsigned`
   - Set to "Unsigned", allow any file type
4. Set all env vars in `.env.local`

## Environment Variables
| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME | Yes | No | Cloudinary cloud name (public, used in URLs) |
| CLOUDINARY_API_KEY | Yes | Yes | Cloudinary API key |
| CLOUDINARY_API_SECRET | Yes | Yes | Cloudinary API secret |
| NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET | Yes | No | Unsigned upload preset name |

## Upload Flow
### Floor Plan (MapEditor)
1. User selects file in building properties panel
2. File is uploaded to Cloudinary via unsigned upload widget
3. Cloudinary returns image URL
4. URL stored on Building record in Supabase

### Panorama (PanoramaManagement)
1. User selects image file on a panorama node card
2. File uploaded to Cloudinary
3. Cloudinary returns image URL
4. URL stored on Node metadata

## Troubleshooting
### Symptom: Upload returns 401
Cause: Upload preset name mismatch or preset set to signed
Fix: Verify preset name and signed/unsigned setting in Cloudinary dashboard

### Symptom: MCP server auth fails
Cause: API key/secret incorrect or OAuth not completed
Fix: Verify credentials in Console Settings > API Keys

### Symptom: Free tier rate limit hit
Cause: Exceeded 25GB storage or bandwidth
Fix: Clean up old assets or upgrade Cloudinary plan
