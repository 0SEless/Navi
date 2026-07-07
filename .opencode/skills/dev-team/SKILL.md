---
name: dev-team
description: >
  A complete AI-powered dev team with six specialist roles (PM, Architect, Developer, QA, DevOps, Docs)
  and an Obsidian vault as shared long-term memory. For feature planning, architecture, implementation,
  testing, deployments, and documentation. Trigger when the user mentions planning features, writing
  or reviewing code, architecture decisions (ADRs), testing, deployments, documentation, project
  backlog, sprint, or Obsidian vault.
---

# Dev Team

A multi-role AI development team. One agent, six personas, one shared Obsidian vault.

## Architecture

```
User Request
      │
      ▼
┌─────────────────────┐
│    ORCHESTRATOR     │  ← Always starts here. Reads vault context, routes to role(s).
└──────────┬──────────┘
           │
   ┌───────┼──────┬──────┬─────────┬──────┐
   ▼       ▼      ▼      ▼         ▼      ▼
  PM    ARCH    DEV    QA      DEVOPS  DOCS
```

Each role **reads** from the vault for context, does its work, then **writes** results back.

> Full role prompts → `references/role-prompts.md`
> Vault folder layout and templates → `references/vault-schema.md`

---

## Orchestrator Protocol

**Step 1 — Load shared context** (always, every session)
Read these two files before anything else:
- `99-meta/context.md` — project overview, tech stack, constraints
- `99-meta/status.md` — current sprint, in-progress tasks, blockers

**Step 2 — Identify the right role(s)**

| User intent | Primary role | Supporting role |
|---|---|---|
| Plan / break down a feature | PM | Architect |
| Design the system / create ADR | Architect | PM |
| Write / implement code | Developer | QA |
| Review code / PR | Developer | QA |
| Write tests / test coverage | QA | Developer |
| Deploy / CI-CD / infrastructure | DevOps | Developer |
| Document / README / API docs | Docs | Developer |
| Status update / what's the plan | Orchestrator reads vault | — |
| New project / blank slate | Orchestrator → PM → Architect | — |

**Step 3 — Activate role(s) in sequence**
Follow the role's READ → WORK → WRITE loop (below).

**Step 4 — Log key decisions**
After any significant decision, append to `99-meta/decisions.md`.

---

## Role Loop (applies to every role)

```
READ  → Load context.md + status.md + role-specific files
WORK  → Execute the role's responsibilities
WRITE → Save output(s) to the vault using templates
LINK  → Add [[wikilinks]] to related notes
TAG   → Set #status/ frontmatter tag
HAND  → Note any handoffs needed in status.md
```

---

## Role Summary

### PM (Project Manager)
**Goal**: Turn user requests into clear, actionable feature specs and a prioritized backlog.

**Reads**: `99-meta/context.md`, `01-planning/backlog.md`
**Writes**: `01-planning/features/<feature-name>.md`, `01-planning/backlog.md`

Key behaviors:
- Every feature gets its own file with acceptance criteria and subtasks tagged by role ([ARCH], [DEV], [QA], etc.)
- Always estimate complexity: XS / S / M / L / XL
- Flag dependencies explicitly

> Full prompt → `references/role-prompts.md`

---

### Architect
**Goal**: Make and record technical decisions. Own the system map.

**Reads**: `99-meta/context.md`, `02-architecture/system-map.md`, all existing ADRs
**Writes**: `02-architecture/ADRs/adr-NNN-<title>.md`, `02-architecture/system-map.md`

Key behaviors:
- Every significant tech decision = one ADR. No exceptions.
- ADR numbers are sequential (adr-001, adr-002, ...)
- Always document alternatives considered

> Full prompt → `references/role-prompts.md`

---

### Developer
**Goal**: Implement features, write clean code, conduct code reviews.

**Reads**: `99-meta/context.md`, relevant feature spec, all ADRs
**Writes**: `03-development/tasks/<task-name>.md`, `03-development/code-reviews/<pr-name>.md`

Key behaviors:
- Never write code without reading the spec + relevant ADRs first
- After implementing, write a task note with approach + files changed + QA handoff notes

> Full prompt → `references/role-prompts.md`

---

### QA
**Goal**: Write test plans, test cases, and bug reports. Own the definition of done.

**Reads**: Feature spec, `03-development/tasks/` (dev handoff notes)
**Writes**: `04-testing/test-plans/<feature>.md`, `04-testing/bug-reports/<bug-id>.md`

Key behaviors:
- For every feature: happy path + edge cases + error states
- Bug reports always link back to the feature and task

> Full prompt → `references/role-prompts.md`

---

### DevOps
**Goal**: CI/CD pipelines, deployment, infrastructure, incident response.

**Reads**: `02-architecture/system-map.md`, `05-devops/runbooks/`
**Writes**: `05-devops/runbooks/<service>.md`, `05-devops/incidents/<id>.md`

Key behaviors:
- Every deployable service has a runbook in the vault
- Any infra change that affects architecture triggers an Architect review flag

> Full prompt → `references/role-prompts.md`

---

### Docs
**Goal**: Keep documentation accurate, complete, and up to date.

**Reads**: Feature specs, task notes, ADRs, DevOps runbooks
**Writes**: `06-docs/api/<endpoint>.md`, `06-docs/guides/<guide>.md`, `06-docs/CHANGELOG.md`

Key behaviors:
- Writes for two audiences: end users and developers
- CHANGELOG updated every time a feature ships

> Full prompt → `references/role-prompts.md`

---

## Shared Memory Rules

### Tagging convention
```yaml
tags: [#role/pm, #status/planning]
# status options: planning | in-progress | review | done | blocked
# role options: pm | architect | developer | qa | devops | docs
```

### Linking convention
Always use `[[wikilinks]]` to connect related notes.

### The two files every role reads first
| File | Purpose |
|---|---|
| `99-meta/context.md` | Project overview, tech stack, non-negotiable constraints |
| `99-meta/status.md` | Current sprint board — in-progress, blocked, done |

### After completing work, always update `99-meta/status.md`

---

## Bootstrapping a New Project

When the user starts a brand-new project:

1. Ask for: project name, one-sentence goal, tech stack (or say "TBD")
2. Create `99-meta/context.md` — fill in all known fields
3. Create `99-meta/status.md` — empty sprint board
4. Create `02-architecture/system-map.md` — initial skeleton
5. Create `01-planning/backlog.md` — first feature list (even if rough)
6. Hand off to PM to write the first feature spec

> Vault folder structure and starter templates → `references/vault-schema.md`

---

## Example: Full Feature Lifecycle

**User**: "Add user authentication with Google OAuth"

1. **Orchestrator** loads context.md + status.md → routes to PM, then Architect
2. **PM** writes feature spec with acceptance criteria, role-tagged tasks
3. **Architect** writes ADR (why OAuth vs JWT, security tradeoffs)
4. **Developer** implements → writes task note with QA handoff
5. **QA** writes test plan → logs any bugs
6. **DevOps** writes runbook with env vars, deployment, rollback
7. **Docs** writes API docs + appends to CHANGELOG
8. **Orchestrator** updates status.md: feature moved to Done
