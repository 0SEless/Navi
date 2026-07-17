---
name: develop
description: Universal entry point for all development work — adds features, fixes bugs, refactors code, architects systems, or investigates issues. Analyzes the codebase first, adapts the workflow to the request, and coordinates specialized skills into one continuous process. Use when the user says develop, add, implement, build, fix, change, modify, refactor, improve, investigate, or debug anything in the project.
---

# Develop

One command for all development work. Determines the type of work, then executes the appropriate workflow, preserving context across every phase.

## Base Skills

This skill loads and delegates to:
- `discover` — for understanding the request
- `analyze` — for codebase analysis
- `pattern-map` — for finding existing conventions
- `rca` — for root cause analysis
- `spec` — for writing specifications
- `plan` — for implementation planning
- `implement` — for task execution
- `verify` — for quality assurance
- `document` — for updating docs
- `graph-update` — for knowledge graph maintenance
- `guide` — for decision validation throughout
- `fix` — for bug diagnosis and corrective code
- `vet` — for architecture validation

## Workflow

### Phase 1 — Discover

Load `discover`. Clarify the request, determine scope, and decide the work type.

**Completion criterion:** Work type determined (feature/bug/refactor/architecture/investigate) + scope understood.

### Phase 2 — Branch by work type

#### Feature

```
Analyze → Pattern Map → Spec → Plan → Implement → Verify → Document → Graph-Update
```

1. Load `analyze` — query graphify, find relevant files, assess impact
2. Load `pattern-map` — search for similar implementations, extract conventions
3. Load `spec` — write spec/SPEC.md with problem, goals, acceptance criteria
4. Load `plan` — create plan/PLAN.md with task breakdown
5. Load `implement` — execute tasks one at a time via TODO → DO → VERIFY
6. Load `verify` — run all checks against acceptance criteria
7. Load `document` — update docs, ADRs, changelog
8. Load `graph-update` — update the knowledge graph

#### Bug Fix

First, triage the bug by complexity. Base the classification on the description and initial inspection.

**Level 1 — Simple (cheap)**
Examples: typo, CSS issue, missing import, wrong icon, off-by-one, wrong property.

```
Understand → Locate → Fix → Verify
```

1. Understand the bug from the description
2. Locate the offending line or file
3. Fix directly
4. Verify the fix works

**Level 2 — Component (medium)**
Examples: React state bug, form not updating, API response incorrect, wrong event handler.

```
Understand → Analyze → Hypothesis → Fix → Regression Check
```

1. Understand the bug
2. Load `analyze` — read the affected file(s), find relevant state/logic
3. Form a hypothesis about the cause
4. Fix
5. Check for regressions in the affected component

**Level 3 — System (expensive)**
Examples: toolbar doesn't control canvas, store desync across modules, compiler generates invalid graph, event bus misrouting, command history corruption.

```
Reproduce → Trace → Find Divergence → Verify Hypothesis → Fix → Regression Test → Document → Graph-Update
```

1. Load `graphify` — query the knowledge graph to find only the relevant files (8–12, not 500)
2. Load `rca` — full root cause analysis across module boundaries
3. Present Root Cause Report to user — ask for confirmation before proceeding
4. Load `fix` — apply the fix based on confirmed root cause
5. Load `verify` — confirm fix works, no regressions
6. Load `document` — update changelog, ADRs if needed
7. Load `graph-update` — update the knowledge graph

**Progressive deepening**

Start at the level that matches the bug's apparent complexity. If evidence is insufficient to confidently identify the root cause, escalate to the next level:

```
Level 1 → can't locate? → Level 2 → hypothesis weak? → Level 3
```

Stop escalating as soon as you have enough evidence to justify a fix.

**Classification heuristics**

| Signal | Likely level |
|--------|-------------|
| Single file, visual/trivial error | Level 1 |
| One component, state data flow | Level 2 |
| Cross-module, multiple stores, event flow, compilation | Level 3 |

**Flags**

The request can override automatic classification:
- `develop --deep [request]` — force Level 3 (full RCA)
- `develop --shallow [request]` — force Level 1

#### Refactor

```
Analyze → Plan → Refactor → Verify → Document → Graph-Update
```

1. Load `analyze` — identify areas needing refactor
2. Load `plan` — plan the refactoring tasks
3. Load `implement` — execute refactoring tasks
4. Load `verify` — regression test everything
5. Load `document` — update docs
6. Load `graph-update` — update the knowledge graph

#### Architecture

```
Analyze → ADR → Plan → Implement → Verify → Document → Graph-Update
```

1. Load `analyze` — understand current architecture and constraints
2. Load `document` (with `adr-generator`) — create ADR for the decision
3. Load `vet` — validate the architecture approach
4. Load `plan` — plan the implementation
5. Load `implement` — execute
6. Load `verify` — verify
7. Load `document` — update architecture docs
8. Load `graph-update` — update the knowledge graph

#### Investigate

```
Reproduce → Root Cause Analysis → Report → Stop
```

Use this when the user wants answers, not fixes — "why is this happening?" or "find the root cause."

1. Load `rca` — reproduce, trace, gather evidence, produce Root Cause Report
2. Present Root Cause Report to user
3. Stop — do not implement any fix unless user explicitly asks

## Completion

After the final phase, confirm to the user what was done and where artifacts live (spec/, plan/, docs/, or the Root Cause Report).
