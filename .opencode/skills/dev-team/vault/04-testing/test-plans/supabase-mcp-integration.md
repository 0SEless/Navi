---
tags: [qa, status/done]
feature: "[[supabase-mcp-integration]]"
date: 2026-06-20
---

# Test Plan: Supabase MCP Integration

## Scope
Testing the Supabase remote MCP server configuration in `.opencode/opencode.json`. Does NOT test database functionality — the MCP is a tooling integration, not a runtime dependency.

## Test Cases
| ID | Scenario | Input / Setup | Expected Output | Type | Priority |
|----|----------|---------------|-----------------|------|----------|
| TC-001 | MCP config is valid JSON | Open `.opencode/opencode.json` | File parses without syntax errors | static | P0 |
| TC-002 | Supabase MCP entry exists | Read `mcp.supabase` object | Has `type: "remote"`, `url`, and `enabled: true` | static | P0 |
| TC-003 | Supabase MCP URL is correct | Check `url` value | `https://mcp.supabase.com/mcp?project_ref=...` with env var | static | P0 |
| TC-004 | Env var referenced | Check `SUPABASE_PROJECT_REF` in URL | Uses `{env:SUPABASE_PROJECT_REF}` syntax | static | P1 |
| TC-005 | OAuth flow triggers (manual) | Opencode starts and connects to Supabase MCP | Browser opens for Supabase login | manual | P1 |

## Edge Cases Checklist
- [x] Config file is valid JSON (opencode.json already valid)
- [x] URL has correct `project_ref` parameter syntax
- [x] MCP server disabled if `enabled: false`

## Definition of Done
- [x] All P0 static checks pass
- [x] Config file validates against opencode schema
