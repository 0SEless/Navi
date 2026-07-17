---
name: verify
description: Runs quality assurance on implemented changes — builds, tests, lint, acceptance criteria checks, and regression tests. Use after any implementation to confirm correctness.
---

# Verify

Quality gate. Confirms the implementation is correct, complete, and doesn't break existing behavior.

## Base Skills

This skill loads:
- `qa-lint-guard` — for automated quality checks

## Workflow

### Step 1 — Load QA

Load `qa-lint-guard`. Run all available automated checks:
- Type checking
- Linting
- Tests (unit, integration, widget as applicable)
- Build

### Step 2 — Acceptance Criteria

Go back to `spec/SPEC.md` (or the original request if no spec). For each acceptance criterion:

- Show evidence that it's met (test output, code path, manual verification)
- If a criterion is not met, flag it immediately

### Step 3 — Regression Check

- Do existing tests still pass?
- Have any existing behaviors changed unintentionally?
- Check edge cases around the change

### Step 4 — Output

```
Automated checks: [pass/fail — with output]
Acceptance criteria: [X of Y met, details]
Regressions: [none / list]
Verdict: [PASS / FAIL / PASS WITH NOTES]
```

If verdict is not PASS, return to implementation with findings.
