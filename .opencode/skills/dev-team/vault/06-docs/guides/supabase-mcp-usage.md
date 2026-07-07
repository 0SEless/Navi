---
tags: [docs, guide]
date: 2026-06-20
---

# Supabase MCP Usage Guide

## Overview
The Supabase MCP server connects AI tools to the NAVI Supabase project, enabling direct database queries, schema management, and TypeScript type generation without leaving the AI interface.

## Available Tools
Once connected, AI tools can use these MCP tools:

| Tool | Purpose |
|------|---------|
| `list_tables` | List all tables in the database |
| `execute_sql` | Run SQL queries |
| `apply_migration` | Apply database migrations |
| `generate_typescript_types` | Generate TypeScript types from schema |
| `get_project_url` | Get project API URL |

## Usage Examples

### List tables
Ask: "What tables exist in the NAVI database? Use MCP tools."

### Create a table
Ask: "Create a `graph_snapshots` table with columns for id, data (JSONB), created_at, and version."

### Generate types
Ask: "Generate TypeScript types from the database schema."

## Security Notes
- Never connect to production — the MCP is for development only
- Always review SQL queries before executing them
- Use `project_ref` scoping to limit access to the NAVI project only
