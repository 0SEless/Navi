---
tags: [docs, guide]
date: 2026-06-20
---

# Cloudinary Integration Guide

## Overview
NAVI uses Cloudinary for all image storage and delivery (building photos, floor plans, 360° panoramas). This guide covers setup, MCP usage, and upload wiring.

## Prerequisites
1. Cloudinary account (free: cloudinary.com)
2. API credentials from Console > Settings > API Keys
3. Unsigned upload preset configured in Console > Settings > Upload

## MCP Servers
Three Cloudinary MCP servers are configured:

| Server | Purpose |
|--------|---------|
| `cloudinary-asset-mgmt` | Upload, search, delete, transform assets |
| `cloudinary-env-config` | Manage upload presets, named transformations |
| `cloudinary-smd` | Define structured metadata fields |

### Using MCP for uploads
Ask: "Upload `sample.jpg` to Cloudinary and return the URL."

### Using MCP for transformations
Ask: "Generate a transformation URL that resizes to 800px wide with auto quality."

## Upload Wiring

### Floor Plans (MapEditor)
Located in the building properties panel (right sidebar, bottom section).
- Select a building → scroll to "FLOOR PLANS" section
- Click upload area → select PNG/JPG/SVG file
- File name displays on selection
- *Future: will upload to Cloudinary and store URL on Building*

### Panoramas (PanoramaManagement)
Located at `/admin/panoramas`.
- Each panorama card has an "Upload panorama" button
- Select JPEG/PNG file → image preview appears
- *Future: will upload to Cloudinary and store URL on Node*

## Environment Variables
```bash
# Required
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=navi_unsigned
```
