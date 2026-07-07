---
tags: [architect, status/accepted]
adr: "001"
date: 2026-06-20
status: Accepted
---

# ADR-001: Supabase MCP Server for AI-Assisted Database Management

## Status
Accepted

## Context
NAVI uses Supabase (PostgreSQL + PostGIS) as its database backend. Currently, AI agents can't interact with the Supabase project directly — every schema migration, table creation, or data query requires manual work in the Supabase dashboard or SQL client. Installing a Supabase MCP server gives AI tools direct, permissioned access to the database via the Model Context Protocol.

Key forces:
- AI agents need to create and manage database tables (graph_snapshots, route_nodes, route_edges)
- AI agents need to run migrations and queries during development
- Security: MCP server must never touch production data
- Our opencode config already supports remote MCP servers

## Decision
Add the Supabase remote MCP server to `.opencode/opencode.json` under the `mcp` section, configured with:
- `type: "remote"` — Supabase hosts the MCP server
- `url: "https://mcp.supabase.com/mcp"` — the standard Supabase MCP endpoint
- OAuth authentication via dynamic client registration (browser-based login)

Additional safeguards:
- Scope to a specific project using `project_ref` parameter
- Use the MCP server only for the development Supabase project
- Read-only mode to be enabled if connecting to projects with real data

## Rationale
- **Remote MCP** is simpler than local — no npm package to install, no credential management
- **OAuth** is more secure than PAT for interactive development — no long-lived tokens stored in config
- **Project scoping** prevents accidental cross-project access
- Supabase provides a well-documented, actively maintained MCP server with tools for database management, debugging, and TypeScript type generation

## Consequences
### Positive
- AI agents can create tables, run queries, and manage schema directly
- TypeScript types can be auto-generated from the database schema
- Development velocity increases — no context-switching to Supabase dashboard

### Negative / Trade-offs
- Requires OAuth login flow each session (browser redirect)
- MCP server adds startup latency when connecting

### Risks
- Prompt injection attacks — mitigated by requiring manual approval for each tool call in opencode
- Never connect to production — use a dedicated development Supabase project

## Alternatives Considered
### Option A: Local Supabase CLI MCP
Run the Supabase CLI locally which exposes MCP at `http://localhost:54321/mcp`. Rejected because it requires running the full Supabase stack locally, which adds complexity and resource usage.

### Option B: Manual SQL via API routes
Create a custom `/api/sql` endpoint that proxies queries to Supabase. Rejected because it duplicates MCP functionality and requires building auth, rate limiting, and query validation from scratch.

## Impact on Other Roles
- Developer: Can use Supabase MCP tools during development for schema management
- QA: Can query the database directly for test data setup and verification
- DevOps: Must ensure the development Supabase project exists and is accessible
- Docs: Document the MCP setup and available tools
