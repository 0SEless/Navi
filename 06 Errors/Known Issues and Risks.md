# Known Issues and Risks

## Current Risks

### Incomplete UI/UX Skill Resources

The installed `ui-ux-pro-max` skill has a valid `SKILL.md`, but its `data` and `scripts` entries are pointer files instead of real folders. The written guidance can still be used, but the search CLI will not work until the real resources are restored.

### Database Design Too Simple

The current [[NAVI Database Design]] is useful as a starting point, but it still needs refinement for multi-campus ownership, map provider settings, route nodes, route edges, floors, rooms, and mobile route visualization.

### Single-Campus Assumptions

Future implementation must avoid hardcoding one campus, one map center, one admin group, or one set of buildings.

### Object Storage Needed

Panoramas, building images, map overlays, and other media should not be stored directly in PostgreSQL. NAVI needs object storage such as Cloudinary, Firebase Storage, S3-compatible storage, or local storage for prototype use.

## Error Log Links

- Use [[Error Log Template]] for implementation or runtime errors.

## Links

- [[TODO]]
- [[NAVI Platform Upgrade Plan]]
- [[NAVI UI UX Pro Max Workflow]]
