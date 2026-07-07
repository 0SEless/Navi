---
tags: [#role/architect, #status/accepted]
date: 2026-06-30
title: "ADR-008: useReducer Over useState for Floor Drawing State"
---

# ADR-008: useReducer Over useState for Floor Drawing State

## Status
Accepted

## Context

`useFloorDrawing` (the hook behind the floor-editor canvas) manages three pieces of drawing state: a `history` array of completed strokes, a `current` in-progress stroke (points being added), and `redos` for undone strokes. The `commitStroke` function reads both `history` and `current` to append the completed stroke and reset the active one.

With three separate `useState` hooks, `commitStroke` captured stale closures over `history` and `current` — the function body froze the values at the time it was created, not at the time it was called. This caused strokes to overwrite rather than append, making multi-stroke drawings corrupt.

## Decision

Replace the three `useState` hooks with a single `useReducer`:

- `DrawState` interface holds `{ history, current, redos }`
- `DrawAction` is a discriminated union of 8 action types (`ADD_POINT`, `COMMIT_STROKE`, `UNDO`, `REDO`, `SET_MODE`, `SET_TYPE`, `RESET`, `SET_FLOOR_PLAN_ID`)
- All state transitions live in the `drawReducer` pure function
- The hook returns stable dispatch, never stale state
- Helper functions wrap dispatch (e.g., `commitStroke = () => dispatch({ type: 'COMMIT_STROKE' })`)

## Alternatives Considered

- **Keep `useState` with functional updates** — `setHistory(h => [...h, current])` avoids stale closures for individual setters, but multi-state transitions (commit needs to read + reset both history and current) remain fragile and hard to sequence.
- **`useRef` for storage + force re-render** — avoids the closure problem entirely but creates a dual tracking system (ref + state) that's harder to audit and debug.
- **Single `useState` with object state** — `setState(s => ({ ...s, history: [...] }))` works similarly to `useReducer` but without the typed action dispatch, making intent harder to trace in dev tools.

## Consequences

- More initial boilerplate (action types, reducer function, type) — worth the correctness guarantee.
- Dispatch is stable across renders — never a stale closure concern.
- Adding new operations (e.g., `MERGE_STROKES`, `CLEAR_ALL`) is one new action type and one reducer case, no new hook-level functions.
- Reducer is pure and testable in isolation without React.

## Links
- [[adr-005-positioning-architecture]]
