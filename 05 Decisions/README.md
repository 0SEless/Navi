# Architecture Decision Records

Decision records for the NAVI platform. Each ADR captures one architectural decision at the time it was made (or, for ADR-013/014, reconstructed from an already-implemented design).

## Pipeline (Infrastructure)

- [[ADR 009 - Compiler Pipeline and Navigation Primitive Generation]] — compiler produces `NavigationArtifacts`
- [[ADR 010 - Navigation Package Format]] — `NavigationPackage` on-disk format
- [[ADR 011 - Publisher Architecture]] — publisher writes packages (atomic nine-step lifecycle)
- [[ADR 012 - Runtime Loader Architecture]] — loader reads packages into `LoadedPackage`

## Runtime

- [[ADR 013 - Runtime Capability Architecture]] — Capability Façade: what a runtime capability is
- [[ADR 014 - Runtime Capability Lifecycle]] — `RuntimeCapability` lifecycle contract (`initialize` / `dispose`)

## Architecture

- [[ADR 016 - Compiler Boundary]] — what is editable vs generated; the golden rule for pipeline separation
- [[ADR 017 - Workspace Ownership Principle]] — every layer has exactly one owner; no feature is duplicated

## Status Legend

`Proposed → Accepted → Deprecated → Superseded`

## By Number

| ADR | Title | Status |
|---|---|---|
| 001 | Multi Campus Platform | Accepted |
| 002 | PostgreSQL PostGIS Database | Superseded by ADR-003 |
| 003 | Mobile 2D Route Animation | Accepted |
| 004 | Rendering Responsibilities | Accepted |
| 005 | Navigation Graph Provenance and Entity-Centric Selection | Accepted |
| 006 | CampusDocument as Persistent Source of Truth | Accepted |
| 007 | Document Transaction Model and Revision-Based Autosave | Accepted |
| 008 | Multi-Floor Navigation Model | Accepted |
| 009 | Compiler Pipeline and Navigation Primitive Generation | Accepted |
| 010 | Navigation Package Format | Accepted |
| 011 | Publisher Architecture | Accepted |
| 012 | Runtime Loader Architecture | Accepted |
| 013 | Runtime Capability Architecture | Accepted |
| 014 | Runtime Capability Lifecycle | Proposed |
| 016 | Compiler Boundary | Accepted |
| 017 | Workspace Ownership Principle | Accepted |
