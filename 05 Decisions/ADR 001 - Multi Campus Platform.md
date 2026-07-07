# ADR 001 - Multi Campus Platform

## Decision

NAVI will be designed as a reusable multi-campus navigation platform, not a custom app for one campus.

## Reason

A single-campus system is useful, but a platform is stronger for thesis defense and real-world use. Multiple campuses, schools, hospitals, malls, or large facilities should be able to configure and deploy their own NAVI environment.

## Rejected Alternatives

- Single-campus hardcoded app: simpler, but less scalable and less defensible as a platform.
- Separate app per campus: flexible visually, but expensive to maintain and duplicates logic.

## Project Impact

- Add a `campuses` parent model.
- Add `campus_id` to major records.
- Add campus-scoped admin roles and permissions.
- Add campus onboarding and map setup.
- Keep routing, directory, QR, and indoor navigation data isolated per campus.

## Links

- [[TODO]]
- [[NAVI Platform Upgrade Plan]]
- [[NAVI Database Design]]
- [[NAVI System Architecture]]
