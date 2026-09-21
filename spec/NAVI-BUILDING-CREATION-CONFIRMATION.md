# NAVI building creation confirmation lifecycle

## Problem

The Studio building-footprint confirmation can remain visible while Save is still committing or after a successful commit. A repeated click can therefore dispatch another `building.create` command and create duplicate buildings.

## Success criteria

1. A successful building Save dispatches exactly one create command, preserves that building, clears the footprint draft, resets drawing/confirmation state, and hides the confirmation UI.
2. A second click (including a rapid double click or a click while persistence is pending) is ignored and cannot create another building or ID.
3. A commit or persistence failure leaves the confirmation and draft available, reports the failure, and re-enables Save for retry without creating a second building on retry.
4. Cancel still discards the draft, closes the confirmation, and leaves transient drawing state idle; the existing autosave/workflow pipeline remains the only persistence path.
5. A later, intentional footprint can be saved as a second building after the first confirmation has finalized.

## Scope and non-goals

- Scope is `src/components/studio/ConfirmOverlay.tsx` and focused confirmation tests, plus the feature ledger artifacts.
- Route confirmation is covered only where it uses the same Save guard/finalization path; no route redesign is intended.
- Do not change sync timing, save queues, CAS, recovery, schema, publishing, or delete persistence.

## Known pitfalls from ERRORS.md

- Treat browser confirmation probes as inconclusive unless the active tool and controls are observed.
- Keep Graphify generated output out of manual edits when a refresh hits the known Windows permission boundary.
- The existing graph-sync conflict boundary must remain intact; a failed workflow save is a retryable UI failure, not a reason to add another network-save path.
