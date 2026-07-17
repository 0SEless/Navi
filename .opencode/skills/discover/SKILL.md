---
name: discover
description: Understands the user's request, asks clarifying questions, determines scope, and decides the work type (feature/bug/refactor/architecture/investigate). Use for the first phase of any development workflow.
---

# Discover

The first step in any development workflow. Turns a request into a clear scope definition.

## Workflow

### Step 1 — Understand the Request

Restate what the user asked for in your own words. Confirm you understand the intent.

### Step 2 — Clarify (guided by guide)

Load `guide`. Ask questions one at a time, each with a recommendation. Cover:

- **What** — What exactly needs to happen? What does done look like?
- **Why** — What problem does this solve? Is there a known root cause?
- **Scope** — What's in scope? What's explicitly out of scope?
- **Constraints** — Any performance, security, or compatibility requirements?
- **Priority** — Is this blocking something else? When does it need to land?

Ask only what's unclear from the original request. If the request is already specific enough, skip straight to the work type decision.

### Step 3 — Determine Work Type

Based on the request, classify the work into one of:

| Type | Description |
|------|-------------|
| Feature | Adding new capability, component, or behavior |
| Bug Fix | Something is broken, throwing errors, or behaving incorrectly |
| Refactor | Restructuring existing code without changing behavior |
| Architecture | Design decision, tech choice, or structural change |
| Investigate | Understanding why something happens — no fix requested, just answers |

If the type is ambiguous, recommend the most likely type and ask for confirmation.

## Output

```
Work type: [feature/bug/refactor/architecture/investigate]
Scope: [1-2 sentence description of what will be done]
User stories: [bullet points if applicable]
Constraints: [any noted constraints]
```
