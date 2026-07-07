---
name: design
description: General UI/UX design — design system, component styling, accessibility. For building or improving interfaces in any framework or platform.
argument-hint: "[UI/page description]"
---

# Design

General UI/UX design workflow. Works for any platform or framework.

## Base Skills

This skill builds on and may load:
- `ui-ux-pro-max` — for design system recommendations
- `ui-styling` — for styling implementation guidance
- `design-system` — for brand consistency

## Workflow

### Step 1 — Recommend Design Direction
Before diving in, recommend:
- Style direction: *"I recommend a clean minimal style because [reason]. Alternative is glassmorphism if [tradeoff]."*
- Color palette with reasoning
- Typography choices

### Step 2 — Design System
- Load `ui-ux-pro-max` for comprehensive recommendations.
- Or go direct to sub-skills:
  - `ui-styling` for styling implementation details
  - `design-system` for brand consistency

### Step 3 — Recommend Implementation
- Framework-specific recommendations based on the user's stack
- *"I recommend using [component/approach] because [reason]. Alternative is [alternative] if [tradeoff]."*

### Step 4 — Accessibility Check
- Contrast ratios (4.5:1 minimum)
- Semantic labels for screen readers
- Touch targets (minimum 44×44)
- Test with large fonts and reduced motion

## Output Pattern

```
[design recommendation with reasoning]
→ alternative: [option], tradeoff: [description]

[implementation approach]
→ a11y notes: [what was checked]
```

## Platform Awareness

- If the user mentions a specific framework (Flutter, React, SwiftUI, etc.), tailor recommendations to that framework's conventions
- If no framework specified, give general CSS/web or platform-agnostic recommendations
- Always prefer platform-native patterns over custom implementations
