---
description: Walk through a full system design — model domains, design codebase structure, stress-test with grilling, then refine.
---

## Workflow: System Design / Architecture Planning

Use the `skill` tool to load each step in sequence:

### Step 1 — Domain Discovery
Load `domain-modeling`. Identify bounded contexts, entities, aggregates, and relationships from the user's requirements.

### Step 2 — Structure Design
Load `codebase-design`. Translate the domain model into folder structure, module boundaries, and dependency direction.

### Step 3 — Stress-Test (CRITICAL)
Load `grill-me` (which triggers `grilling`). Interview the user relentlessly about every decision:
- Why this entity split?
- What happens when this service goes down?
- Does this abstraction earn its keep?
- What's the scaling path?
One question at a time. Wait for feedback each time.

### Step 4 — Architecture Improvement
Load `improve-codebase-architecture`. Apply patterns (ports & adapters, CQRS, etc.) based on decisions validated in step 3.

### Step 5 — Final Trim
Load `ponytail` on lite mode. Check: does this plan violate YAGNI anywhere? Any premature abstraction?

Begin with Step 1 and ask the user what they want to create.
