---
name: rca
description: Root Cause Analysis — traces symptoms to their underlying cause through evidence-gathering and hypothesis testing. Use for system-level bugs, performance issues, or any unexpected behavior across module boundaries. Uses graphify to scope investigation to relevant files only. Produces a report before any fix is proposed.
---

# Root Cause Analysis

Systematically traces a symptom to its root cause. Does not propose a fix until the cause is confirmed with evidence.

## Core Rule

Before you can suggest a fix, you must produce a Root Cause Report with evidence. No report = no fix.

## Workflow

### Step 1 — Understand the Symptom

- What exactly is happening? Get precise language from the user.
- What should be happening instead?
- When did this start? What changed recently?
- Is it consistent or intermittent?
- What's the impact?

### Step 2 — Scope with Graphify

Before tracing, narrow the search space:
- Load `graphify`. Query the knowledge graph for relevant nodes, files, and relationships
- Identify the modules involved (stores, controllers, services, components)
- Limit investigation to those files only — typically 8–12, not the whole project

### Step 3 — Reproduce

Before tracing anything, confirm you can reproduce the bug or observe the behavior:
- What steps trigger it?
- What environment/state is required?
- Can you reproduce with a minimal test case?

**Completion criterion:** You can consistently reproduce the symptom, or you know exactly why it can't be reproduced deterministically.

### Step 4 — Trace the Control Flow

Starting from the symptom, work backwards through the code:

1. **Find the output** — Where does the incorrect behavior manifest?
2. **Find the inputs** — What feeds into that output?
3. **Trace the path** — Follow the data/event flow from input to output
4. **Find the divergence** — Where does actual behavior diverge from expected?

For complex systems (NAVI: stores, command system, event bus, interaction controller, compiler, MapLibre), trace across module boundaries explicitly.

### Step 5 — Gather Evidence

For each candidate location in the trace:

- Read the relevant source code
- Check the state/logic at that point
- Verify the hypothesis: "If X were the root cause, then Y would happen"
- Look for: wrong state, wrong condition, wrong data flow, race condition, missing sync

### Step 6 — Formulate Hypothesis

Based on evidence, state the root cause:

- **Root cause:** One sentence describing the fundamental issue
- **Why it happens:** The mechanism that produces the symptom
- **Evidence:** File paths, line numbers, relevant code snippets
- **Confidence:** High / Medium / Low — and why

If confidence is Low, return to Step 3. Do not proceed.

### Step 7 — Verify

Test the hypothesis:
- Does changing the suspected root cause fix the symptom?
- Are there other scenarios that should break but don't?
- Can you create a minimal test that demonstrates the cause?

### Step 8 — Output Root Cause Report

```
## Root Cause Report

**Symptom:** [what the user observed]

**Observed Behavior:** [what actually happens]

**Expected Behavior:** [what should happen]

**Reproduction:** [steps to reproduce]

**Trace:**
[Sender] → [Module] → [...] → [Divergence point]

**Root Cause:**
[one sentence]

**Evidence:**
- `path/to/file.ts:42` — [what the evidence shows]
- `path/to/file.ts:117` — [what the evidence shows]

**Confidence:** [High/Medium/Low]

**Alternative Hypotheses Considered:**
- [alternative] — rejected because [reason]

**Suggested Solutions (if applicable):**
- [approach 1] — [trade-off]
- [approach 2] — [trade-off]
```
