---
name: spec
description: Writes a specification document for a feature or change. Creates spec/SPEC.md with problem statement, goals, acceptance criteria, and technical considerations. Use when a clear written spec is needed before implementation.
---

# Spec

Creates a written specification that serves as the source of truth for what's being built.

## Workflow

### Step 1 — Check for Existing Templates

Look for existing spec templates in:
- spec/ directory (if it exists)
- `.opencode/templates/` directory
- Project templates or examples

If a template exists, use it. If not, use the standard structure below.

### Step 2 — Write SPEC.md

Create `spec/SPEC.md` with the following sections:

**Problem** — What problem is being solved? What's the current pain or gap?

**Goals** — What success looks like. 3-5 concrete criteria that can be verified.

**Non-goals** — What is explicitly out of scope for this spec.

**User Stories** — How users interact with this feature (in feature-type work).

**Acceptance Criteria** — Specific, testable conditions that must be met.

**Technical Considerations** — Architecture impact, performance, security, compatibility notes.

**Known Pitfalls** — Any risks or pitfalls identified during analysis that this change should avoid.

### Step 3 — Self-Review

Check the spec for:
- **Placeholders** — Any "TBD", "TODO", or blank sections? Fill them.
- **Contradictions** — Do any sections disagree with each other?
- **Ambiguity** — Could any requirement be interpreted multiple ways?
- **Scope creep** — Is this focused enough for one implementation cycle?

Fix any issues before proceeding.

### Step 4 — User Review

Present the spec to the user. Wait for approval before proceeding to planning.
