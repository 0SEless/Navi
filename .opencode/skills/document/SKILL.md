---
name: document
description: Updates project documentation after a change — README, changelog, ADRs, inline docs. Use after implementation and verification to keep the project's documentation in sync.
---

# Document

Keeps documentation in sync with the codebase after changes.

## Base Skills

This skill loads:
- `adr-generator` — for recording architectural decisions

## Workflow

### Step 1 — README

Update README if the change:
- Adds, removes, or changes a major feature
- Changes setup, configuration, or usage instructions
- Adds new environment variables or dependencies

### Step 2 — Changelog

Update the changelog (CHANGELOG.md, CHANGELOG, or equivalent):
- Add an entry describing what changed
- Categorize as Added / Changed / Fixed / Removed
- Link to the spec or issue if applicable

### Step 3 — Architecture Decision Records

If the change involves an architectural decision:
- Load `adr-generator`
- Record the decision with context, options considered, and rationale

### Step 4 — Inline Documentation

- Update any doc comments that are now inaccurate
- Add doc comments for new public APIs
- Remove any now-obsolete comments or docs

### Step 5 — Output

```
README: [updated / no change needed]
Changelog: [updated / no change needed]
ADRs: [created / no change needed]
Inline docs: [updated / no change needed]
```
