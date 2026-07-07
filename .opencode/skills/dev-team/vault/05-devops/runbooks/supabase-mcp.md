---
tags: [devops, runbook]
service: "Supabase MCP Server"
date: 2026-06-20
---

# Runbook: Supabase MCP Server

## Purpose
Provides AI agents direct access to the Supabase project for database management, schema migrations, queries, and TypeScript type generation.

## Prerequisites
- Access required: Supabase account (free tier sufficient)
- Environment variables:
  - `SUPABASE_PROJECT_REF` — project reference from Supabase dashboard URL (e.g., `abcdeft` from `https://supabase.com/dashboard/project/abcdeft`)

## Setup
1. Create a Supabase project at https://supabase.com
2. Copy the project reference from the dashboard URL
3. Set `SUPABASE_PROJECT_REF` in `.env.local`
4. MCP server auto-authenticates via OAuth on first connection

## Environment Variables
| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| SUPABASE_PROJECT_REF | Yes | No | Supabase project ID from dashboard URL |

## Troubleshooting
### Symptom: MCP server won't connect
Cause: OAuth flow not completed
Fix: Restart opencode and follow the browser-based login prompt

### Symptom: "Project not found" error
Cause: `SUPABASE_PROJECT_REF` is incorrect
Fix: Check the project ref in your Supabase dashboard URL
