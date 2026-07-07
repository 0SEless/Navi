---
name: research
description: Investigates frameworks, libraries, APIs, docs, and best practices on-the-fly. Automatically triggered when encountering unfamiliar technology or when the user asks a research question.
---

# Research

Self-learn on the job. When you hit something unfamiliar, look it up before
answering or building.

## When to Trigger

- You encounter a library, API, or framework you haven't used before
- The user asks about a technology, pattern, or approach
- There are multiple ways to solve a problem and you want to recommend the best one
- The user says "research X" or "look up X"
- A decision depends on understanding current best practices

## How to Research

1. **Web search first** — use `websearch` for broad understanding
2. **Then docs** — use `webfetch` on official documentation
3. **Synthesize** — summarize what you found in 2–3 sentences
4. **Recommend** — apply the findings to the user's context

## Output Pattern

```
I looked into [topic]. Here's what I found:
[2-3 sentence summary]

Recommendation for your context:
[applied advice]
```

## Boundaries

- Keep research focused — don't rabbit-hole
- If the user didn't ask for research, still check quickly in the background
- Note in your response that you checked: *"I checked the latest docs — [finding]."*
