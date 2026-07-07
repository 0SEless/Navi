# Vault Schema

The Obsidian vault is the team's shared brain. Every role reads from it and writes to it.
This file defines the folder structure and the starter content for each file.

---

## Folder Structure

```
vault/
├── 00-inbox/              # Drop zone for raw ideas, meeting notes, unprocessed requests
│
├── 01-planning/           # PM owns this
│   ├── backlog.md         # Prioritized list of all features
│   └── features/          # One file per feature
│       └── <feature>.md
│
├── 02-architecture/       # Architect owns this
│   ├── system-map.md      # Living system diagram
│   └── ADRs/              # Architecture Decision Records
│       └── adr-NNN-<title>.md
│
├── 03-development/        # Developer owns this
│   ├── tasks/             # One file per implemented task
│   │   └── <task>.md
│   └── code-reviews/      # Code review notes
│       └── <pr-name>.md
│
├── 04-testing/            # QA owns this
│   ├── test-plans/        # One file per feature
│   │   └── <feature>.md
│   └── bug-reports/       # Bug reports
│       └── BUG-NNN-<title>.md
│
├── 05-devops/             # DevOps owns this
│   ├── runbooks/          # One file per service
│   │   └── <service>.md
│   └── incidents/         # Post-mortems
│       └── INC-NNN-<title>.md
│
├── 06-docs/               # Docs owns this
│   ├── api/               # API endpoint documentation
│   │   └── <endpoint-group>.md
│   ├── guides/            # User & developer guides
│   │   └── <guide>.md
│   └── CHANGELOG.md       # Running changelog
│
└── 99-meta/               # Orchestrator reads first, every session
    ├── context.md         # Project overview. Read first.
    ├── status.md          # Current sprint board
    └── decisions.md       # Log of key cross-role decisions
```

---

## Starter Templates

### 99-meta/context.md

```markdown
---
tags: [meta]
last-updated: YYYY-MM-DD
---

# Project Context

## Project Name
<Name>

## Goal
One paragraph. What are we building, and why does it matter?

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | | |
| Backend | | |
| Database | | |
| Auth | | |
| Infrastructure | | |
| CI/CD | | |

## Key Constraints
Non-negotiables that all future decisions must respect:

## Non-Goals
What this project will never do:

## Team Memory / Don't Forget
Things that are easy to get wrong or have caused issues before:
```

### 99-meta/status.md

```markdown
---
tags: [meta]
last-updated: YYYY-MM-DD
---

# Status

## In Progress
- [ ] [PM] Writing feature spec for [[<feature>]]
- [ ] [DEV] Implementing [[<task>]]
- [ ] [QA] Testing [[<feature>]]

## Blocked

## Needs Review

## Done This Sprint
- [x] [DEV] Completed [[<task>]]

## Up Next
- [ ] [[<feature>]] — waiting on [ARCH]
- [ ] [[<feature>]] — ready to start
```

### 99-meta/decisions.md

```markdown
---
tags: [meta]
---

# Decisions Log

One line per decision. Format: `Date | Role | Decision | Affected notes`
```

### 01-planning/backlog.md

```markdown
---
tags: [pm]
last-updated: YYYY-MM-DD
---

# Backlog

## Priority 1 — This Sprint

## Priority 2 — Next Sprint

## Priority 3 — Backlog

## Ideas / Someday
```

### 02-architecture/system-map.md

```markdown
---
tags: [architect]
last-updated: YYYY-MM-DD
---

# System Map

## Architecture Overview

## Services
| Service | Tech | Port | Repo/Path | Managed by |
|---------|------|------|-----------|-----------|

## External Integrations
| Service | Purpose | Auth Method | Docs |
|---------|---------|-------------|------|

## Key Constraints
```

### 06-docs/CHANGELOG.md

```markdown
# Changelog

## [Unreleased]

## [0.1.0] — YYYY-MM-DD
### Added
- Initial project setup
```

---

## Tagging Reference

### Status tags
| Tag | Meaning |
|-----|---------|
| status/planning | Being designed / specced |
| status/in-progress | Actively being worked on |
| status/review | Waiting for review or sign-off |
| status/done | Complete and verified |
| status/blocked | Waiting on something else |

### Role tags
| Tag | Owner |
|-----|-------|
| pm | Project Manager |
| architect | Architect |
| developer | Developer |
| qa | QA Engineer |
| devops | DevOps Engineer |
| docs | Documentation |

### Severity tags (for bugs and incidents)
| Tag | Meaning |
|-----|---------|
| severity/p0 | Total blocker / outage |
| severity/p1 | Major impact |
| severity/p2 | Minor impact |
| severity/p3 | Cosmetic |

---

## Wikilink Conventions

Always link from child to parent and sibling to sibling:

```markdown
# In a task note:
Feature: [[user-authentication]]
ADR used: [[adr-001-auth-strategy]]

# In a bug report:
Feature: [[user-authentication]]
Introduced in: [[auth-implementation-task]]

# In a test plan:
Feature: [[user-authentication]]
Dev task: [[auth-implementation-task]]
```
