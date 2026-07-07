---
name: plan
description: Ground-up software planning with research validation — domain modeling, tech validation, architecture, codebase structure, feasibility gate, and YAGNI trim. For any software project from concept to blueprint.
argument-hint: "[project or feature description]"
---

# Plan (Ground-Up)

Full ground-up planning pipeline. Every idea is researched and verified before being accepted into the plan.

## Base Skills

This skill builds on and may load:
- `research` — web search for viable solutions, frameworks, libraries, patterns
- `vet` — feasibility reality check before committing
- `domain-modeling` — entity discovery and bounded contexts
- `codebase-design` — folder/module structure
- `guide` — decision validation
- `ponytail` — YAGNI trim

## Workflow

### Step 0 — Research & Feasibility Gate

This step runs BEFORE any design work. Its purpose is to verify that the
approach is viable, supported, and industry-proven.

- Search the web for: existing solutions, comparable projects, available
  libraries/frameworks, common pitfalls, best practices
- If the user proposed a specific tech stack or architecture:
  - Research whether it is still actively maintained
  - Check for known limitations or breaking changes
  - Verify it solves the actual problem (not just trend-following)
- If the user proposed a feature/concept:
  - Find at least 2 real-world examples of it working
  - Check for documentation quality and community support
- **Feasibility Gate:**
  - If research shows the approach is unproven, deprecated, outscoped,
    or has a clearly better alternative → do NOT proceed. Report findings
    and recommend the alternative.
  - If research confirms viability → proceed to Step 1.

**Output:** Research summary with sources + feasibility verdict

### Step 1 — Domain Discovery
- Identify entities, relationships, bounded contexts from the user's requirements
- Follow the **recommend-first** pattern from `guide`: propose entities with reasoning
- Output: domain glossary + entity list

### Step 2 — Structure Design
- Propose folder/module structure with justification
- *"I recommend a feature-first structure because [reason]. Flat-by-type would
  also work if [tradeoff]."*
- Output: folder tree

### Step 3 — Validate
- Load `guide` and walk through each decision from steps 1–2
- One question at a time, each with a recommendation

### Step 4 — YAGNI Trim
- Load `ponytail` (lite mode)
- Check: any entities not needed for MVP? Any abstractions too early?
  Any files that can be merged?
- Output: trimmed plan

## Output Format

After all steps, produce a **written plan document** with:
- Research summary and feasibility verdict
- Domain entities and relationships
- Folder/module structure
- Key tech decisions (with reasoning and research sources)
- What was deferred (and why)
- What was rejected at feasibility gate (and why)

## Key Rules

1. **Research before design** — never propose a solution without verifying
   it exists and works.
2. **Feasibility gate is binding** — if research shows the idea is bad,
   the plan stops and reports why.
3. **Cite sources** — every tech decision in the final plan must reference
   the research that supports it.
4. **Ground-up means ground-up** — start from the problem, not from a
   pre-chosen solution. Let research guide the tech choices.
