---
name: graph-update
description: Updates the project knowledge graph after code changes. Runs graphify update and records new architectural relationships. Use after any implementation to keep the knowledge graph current.
---

# Graph Update

Keeps the project's knowledge graph in sync with the codebase after changes.

## Base Skills

This skill loads:
- `graphify` — for knowledge graph operations

## Workflow

### Step 1 — Load Graphify

Load `graphify`.

### Step 2 — Update Knowledge Graph

If the project has a graphify knowledge base (graphify-out/):

1. Run `graphify update .` to refresh the knowledge graph
2. Note any dirty graph files — these are expected after incremental updates

If the project does NOT have a knowledge graph, skip this step.

### Step 3 — Record New Relationships

For any new files, modules, or dependencies added:
- Reflect them in any architecture docs if applicable
- If the project uses a domain glossary, update it

### Step 4 — Output

```
Knowledge graph: [updated / not applicable]
New files indexed: [count]
New relationships: [description of new connections]
```
