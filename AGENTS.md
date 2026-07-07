## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

**YOU MUST QUERY THE GRAPH FIRST** before using grep, glob, Read, or any file-search tool. This is not optional.

### Trigger rules (MANDATORY)

Trigger `graphify query` when the user asks ANYTHING about:
- How something works, is structured, or connects
- Where a feature, file, class, function, or concept lives
- Architecture, data flow, relationships, or dependencies
- The project, its code, its design, or its configuration
- A feature, bug, or component by name (even external-sounding names — check if there's related code first)
- ANY mention of a domain concept (map, building, floor, room, auth, graph, etc.)

### Commands

| When | Command |
|------|---------|
| General question about codebase | `graphify query "<question>"` |
| Relationship between two things | `graphify path "<A>" "<B>"` |
| Deep dive on one concept | `graphify explain "<concept>"` |
| After modifying code | `graphify update .` |
| User types `/graphify` | Invoke the `skill` tool with `skill: "graphify"` |

### Rules
- Dirty graph files are expected after incremental updates — not a reason to skip.
- Read GRAPH_REPORT.md only for broad architecture review when query/path/explain don't surface enough context.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Only skip graphify if the task is explicitly about stale/incorrect graph output, or the user says not to use it.

## gsd

Get Shit Done — spec-driven development with 67 commands installed in this project.

Use `/gsd-new-project` to bootstrap a new feature/milestone (creates ROADMAP.md, phases, plans).
Use `/gsd-progress` for status and `/gsd-plan-phase` for detailed plans.
Use `/gsd-quick` for small tasks you want tracked.
Use `/gsd-help` to list all commands.

## WORKFLOW LOOP (MANDATORY)

This loop is **not optional**. Every session follows it step by step. No step may be skipped or combined.

### The Loop: SPEC → PLAN → TODO → DO → VERIFY → LOG → REPEAT

```
╔══════════════════════════════════════════════════╗
║              WORKFLOW LOOP                       ║
╠══════════════════════════════════════════════════╣
║                                                   ║
║   ┌──────┐                                       ║
║   │ SPEC │  Write/read SPEC.md: WHAT, not how    ║
║   └──┬───┘                                       ║
║      v                                           ║
║   ┌──────┐                                       ║
║   │ PLAN │  Write PLAN.md: tasks, acceptance,     ║
║   └──┬───┘  checkpoints, error prevention         ║
║      v                                           ║
║   ┌──────┐                                       ║
║   │ TODO │  Create visible task list from PLAN    ║
║   └──┬───┘                                       ║
║      v                                           ║
║   ┌──────┐                                       ║
║   │  DO  │  Execute ONE task. Read errors from   ║
║   └──┬───┘  ERRORS.md before writing code         ║
║      v                                           ║
║   ┌────────┐                                     ║
║   │ VERIFY │  Show evidence. Never say "done"    ║
║   └──┬─────┘  without proof.                     ║
║      v                                           ║
║   ┌──────┐                                       ║
║   │ LOG  │  Update PROGRESS.md + ERRORS.md       ║
║   └──┬───┘                                       ║
║      v                                           ║
║   REPEAT from TODO until all tasks done           ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
```

### Step Details

**SPEC** (`spec/SPEC.md`)
- One file per feature. State WHAT in plain language.
- List what success looks like (3–5 concrete criteria).
- List known pitfalls from ERRORS.md that apply.

**PLAN** (`plan/PLAN.md`)
- Break SPEC into numbered tasks (T1, T2, T3...).
- Each task has: description, files to touch, acceptance check.
- Before each task: "What errors from ERRORS.md could this task introduce?"

**TODO** (visible task list)
- Use `todowrite` to create a checklist from PLAN tasks.
- Exactly one task `in_progress` at a time.

**DO** (execute)
- Read ERRORS.md before writing any code for the current task.
- Touch only the files listed in PLAN for this task.
- If you discover a new error DURING work, record it immediately (see LOG).

**VERIFY** (evidence gate — **critical**)
- Run the code. Show a screenshot, test output, or lint result.
- "Looks good" or "seems to work" is NOT verification.
- Verification fails? Go back to DO. If stuck 3 times, flag the user.
- Check the new code against all relevant entries in ERRORS.md.

**LOG** (`progress/PROGRESS.md` + `errors/ERRORS.md`)
- **PROGRESS.md**: timestamp, what was done, what's next, verification result.
- **ERRORS.md**: append every error encountered with:
  ```
  ## YYYY-MM-DD: Short Description
  - **Error**: what happened
  - **Cause**: why it happened
  - **Fix**: how it was resolved
  - **Prevention**: how to avoid / detect in advance
  - **Related tasks**: T1, T3
  ```

### Error Prevention Rule

Before starting ANY new task, the model MUST:
1. Read ERRORS.md
2. State which entries are relevant to this task
3. Say "Preventing: [error description]" before writing code

### Hallucination Guard

The model MUST NOT:
- Declare a file written without outputting its path
- Say "done" without VERIFY step completing
- Assume a past step worked without re-running verification
- Skip LOG step for any reason
- Proceed to next task without showing verification evidence

Violating any of these = workflow failure. Stop and correct immediately.

### File Structure
```
errors/ERRORS.md       — ledger of every error encountered
progress/PROGRESS.md   — session-by-session progress log
spec/SPEC.md           — feature specs
plan/PLAN.md           — execution plans
```
