---
name: fix
description: Debug, audit, and refactor — systematic diagnosis with security awareness. For fixing bugs or cleaning up code.
argument-hint: "[bug description or code area]"
---

# Fix

Systematic debugging and code health workflow.

## Base Skills

This skill builds on and may load:
- `diagnosing-bugs` — for systematic diagnosis
- `ponytail-audit` — for security review
- `ponytail-debt` — for tech debt identification

## Workflow

### Step 1 — Hypothesis First
Before touching code, recommend the likely cause:
- *"Based on [evidence], I suspect [X] because [reason]. But it could also be [Y] if [condition]. Let me check [X] first."*
- Then investigate.

### Step 2 — Diagnose
- Load `diagnosing-bugs`. Walk through systematically.
- Present findings with evidence.

### Step 3 — Recommend Fix
- *"I recommend [fix] because [reason]. Alternative is [workaround] if [tradeoff]."*
- Apply the fix after confirmation.

### Step 4 — Security Audit
- Load `ponytail-audit`. Check: injection, auth bypass, data leaks, input validation.
- *"Audit found [X]. Recommend [fix]."*

### Step 5 — Tech Debt Check (optional)
- If the affected area has accumulated debt, load `ponytail-debt`.
- Recommend quick wins while you're in the code.

## When to Skip Steps

- Typo/trivial bug → skip steps 1–2, go straight to fix + audit
- Security-only audit → skip diagnosis, go straight to ponytail-audit
- User says "just fix it" → skip recommendations, fix + note what you changed
