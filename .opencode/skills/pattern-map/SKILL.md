---
name: pattern-map
description: Discovers existing patterns, conventions, and reusable components in the codebase. Use before writing new code to ensure consistency with the project's established style.
---

# Pattern Map

Ensures new code follows the project's existing patterns rather than inventing new ones.

## Workflow

### Step 1 — Search for Similar Implementations

Find how similar features or components are already implemented:
- Search for analogous files, modules, or components
- Look at how they're structured, named, and connected
- Check how they're tested

### Step 2 — Identify Reusable Components

- Are there existing components, helpers, or utilities that can be reused?
- Are there patterns (hooks, services, factories, etc.) that the change should follow?
- Can the new code reuse or extend existing abstractions instead of creating new ones?

### Step 3 — Map Conventions

Document the relevant conventions in the affected area:
- File naming and structure
- Import ordering
- Error handling patterns
- Testing patterns
- State management approach
- API conventions (REST, GraphQL, etc.)
- Database patterns (migrations, queries, etc.)

### Step 4 — Output

```
Similar implementations found:
- path/to/example (matches [criteria])

Reusable components:
- ComponentOrUtility (how it applies)

Conventions to follow:
- [convention 1]
- [convention 2]

Anti-patterns to avoid:
- [what not to do, with existing example]
```
