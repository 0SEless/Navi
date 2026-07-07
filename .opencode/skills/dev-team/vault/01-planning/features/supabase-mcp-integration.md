---
tags: [pm, status/in-progress]
created: 2026-06-20
complexity: S
---

# Feature: Supabase MCP Integration

## Summary
Configure a remote MCP server for Supabase so AI tools can directly query the database, create tables, run migrations, and manage the Supabase project.

## Problem Being Solved
Currently, AI agents can't interact with the Supabase project directly. Every schema change, table creation, or data query requires manual work in the Supabase dashboard. An MCP server gives AI tools direct, permissioned access to the database.

## Acceptance Criteria
- [ ] Given the MCP is configured, when an AI tool needs to create a table, then it can run a SQL command against the Supabase project
- [ ] Given the MCP is configured, when querying data, then results return in real-time from the Supabase database
- [ ] Given the MCP is configured, when the user runs a migration, then the schema updates take effect immediately

## Out of Scope
- Supabase Auth configuration via MCP (use dashboard for now)
- Supabase Storage (we're using Cloudinary for images)
- Multiple Supabase projects

## Tasks
- [ ] [ARCH] Review MCP security implications — does this need an ADR?
- [ ] [DEV] Add `supabase` entry to `.opencode/opencode.json` under `mcp` with remote type
- [ ] [DEV] Configure the Supabase MCP server URL and auth headers
- [ ] [DEV] Set environment variables in `.env.local` for Supabase connection
- [ ] [QA] Verify MCP connection succeeds — AI tool can list tables
- [ ] [DOCS] Document how to use Supabase MCP

## Dependencies
- Blocked by: none
- Blocks: [[cloudinary-integration]], database schema creation

## Estimate
Complexity: S
Reasoning: Simple configuration change — one JSON block in existing config, one env var.
