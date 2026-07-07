# NAVI UI UX Pro Max Workflow

Use this note as the bridge between Codex, Obsidian, and the `ui-ux-pro-max` skill.

## Skill Source

Downloaded skill folder:

```text
C:\Users\Administrator\Downloads\ui-ux-pro-max\ui-ux-pro-max
```

The folder contains a valid `SKILL.md`, but its `data` and `scripts` entries are pointer files rather than actual folders in this download. That means Codex can use the written UI/UX guidance now, but the skill's search CLI will need the missing real `data` and `scripts` folders restored before command-based design-system lookup works.

## When Codex Should Use It

Use the UI/UX guidance whenever a task changes how NAVI looks, feels, moves, or is interacted with.

Trigger examples:

- Design the mobile navigation screen
- Build the admin dashboard
- Improve the campus map UI
- Review accessibility
- Choose colors, typography, spacing, icons, motion, or layout
- Create a component such as a button, modal, form, table, route card, map marker, bottom sheet, or chart

Do not use it for pure backend, database, infrastructure, or non-visual automation work.

## NAVI Design Priorities

NAVI is a mobile-first campus navigation product. Prioritize:

- Fast destination search
- Clear route instructions
- Accessible map controls
- Outdoor GPS and indoor panorama continuity
- Safe-area aware mobile layout
- Large touch targets for walking users
- Offline and low-connectivity states
- Admin dashboard clarity for mapping and content management

## Required UI/UX Checks

Before delivering UI work, check:

- Contrast meets WCAG AA: 4.5:1 for normal text
- Touch targets are at least 44 x 44 pt
- Icon-only controls have accessible labels
- Layout works on small phones and landscape
- Motion respects reduced-motion preferences
- Loading, empty, error, and offline states exist
- Primary action is visually clear on each screen
- Map and panorama controls do not overlap system bars
- Color is not the only way information is communicated

## Obsidian Workflow

For every UI feature:

1. Start from a feature note in `01 Product`.
2. Link to relevant engineering notes in `02 Engineering`.
3. Create a design note in `03 Plans`.
4. Implement with Codex.
5. Add a build log in `04 Build Logs`.

Suggested note links:

- [[NAVI Project Requirements]]
- [[NAVI System Architecture]]
- [[NAVI Database Design]]
- [[NAVI Roadmap]]

## Feature Note Template

```md
# Feature: <Name>

## Goal

## Users

## User Flow

## UI Requirements

## Backend Requirements

## Data Requirements

## Accessibility Requirements

## Acceptance Criteria

## Links
- [[NAVI Project Requirements]]
- [[NAVI UI UX Pro Max Workflow]]
```
