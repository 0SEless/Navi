---
name: analyze
description: Analyzes the codebase in relation to a development request. Queries the knowledge graph, finds relevant files, detects dependencies, and assesses impact. Use before implementing any change.
---

# Analyze

Codebase intelligence phase. Maps the territory before changing it.

## Base Skills

This skill loads:
- `graphify` — for knowledge graph queries

## Workflow

### Step 1 — Load Graphify

Load `graphify`. Query the knowledge graph for relevant context.

If the project has a graphify knowledge base (graphify-out/):
- Query the graph for relevant god nodes, communities, and relationships
- Ask: "What does the graph know about [the relevant domain]?"

If the project does NOT have a knowledge graph:
- Use file search and code search tools directly

### Step 2 — Find Relevant Files

Identify:
- Files directly related to the requested change
- Files that depend on what you're changing
- Files that your change will depend on

### Step 3 — Identify Central Modules

Find the key abstractions, modules, or services that:
- The change touches
- The change sits between
- The change extends

### Step 4 — Assess Impact

- What's the blast radius of this change?
- Which existing tests might break?
- Which features or integrations touch the same code?
- Are there any known issues or TODOs in this area?

### Step 5 — Output Summary

```
Area: [which part of the codebase]
Relevant files:
- path/to/file (reason)
- path/to/file (reason)

Central modules:
- ModuleName: [description]

Impact:
- [what might break or need updates]

Dependencies:
- [internal/external deps affected]
```
