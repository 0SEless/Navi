---
name: implement
description: Executes implementation tasks one at a time. Loads build, tdd, or prototype skills as appropriate. Verifies each task before moving to the next. Use after a plan has been created.
---

# Implement

Task execution engine. Works through a plan one task at a time, verifying each before moving on.

## Base Skills

This skill loads as needed:
- `build` — for implementing from a plan
- `tdd` — for test-driven development
- `prototype` — for rapid first-pass implementation
- `fix` — for fixing issues discovered during implementation
- `guide` — for implementation decisions

## Workflow

### Step 1 — Load the Plan

Read `plan/PLAN.md`. Extract the task list with files to touch and acceptance criteria.

### Step 2 — Create TODO List

Use `todowrite` to create a task list from the plan. Mark the first task `in_progress`.

### Step 3 — Task Loop

For each task:

1. **Read ERRORS.md** — Check for relevant past errors that apply to this task
2. **State prevention** — Name the error you're preventing before writing code
3. **Read relevant source files** — Understand existing code before editing
4. **Implement** — Write the code, touching only the files listed in the plan
5. **Verify** — Run compile/type-check/lint for the affected area
6. **Commit** — Commit the task with a descriptive message
7. **Update todo** — Mark task completed, move next task to in_progress

### Step 4 — Decision Support

If you hit a design decision during implementation:
- Load `guide`. Recommend first, then ask.
- Don't guess — if unsure about a pattern, check existing code.

### Step 5 — Completion

When all tasks are done:
- Mark all todos complete
- Summarize what was implemented
- Note any deviations from the plan
