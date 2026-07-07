---
tags: [architect, status/accepted]
adr: "003"
date: 2026-06-20
status: Accepted
supersedes: "ADR-002"
---

# ADR-003: Supabase (PostgreSQL + PostGIS) as Database Platform

## Status
Accepted — Supersedes ADR-002

## Context
ADR-002 originally chose self-managed PostgreSQL + PostGIS and explicitly rejected Supabase. Since then, the project has:
- Migrated to Next.js 16 (serverless, deployed on Vercel)
- Built API routes using `@supabase/supabase-js` v2.49.0
- Created client/server Supabase library files
- Wired the graph API to query Supabase tables
- Chosen Cloudinary for image storage (removing the need for Supabase Storage)

The self-managed PostgreSQL approach adds operational overhead (server provisioning, backups, connection pooling, TLS management) that doesn't align with a serverless deployment model. Supabase provides managed PostgreSQL with PostGIS, which is the same underlying technology with zero ops overhead.

Key forces:
- Serverless architecture (Vercel) needs a managed database — self-managed PG adds complexity
- PostGIS is available as a one-click Supabase extension
- Supabase provides auth, which the project will need later
- The project already has 57 dependencies — adding a database server to manage is disproportionate

## Decision
Use Supabase as the managed PostgreSQL provider with PostGIS extension enabled. Supabase handles:
- Database provisioning and scaling
- TLS/connection pooling
- Automated backups
- PostGIS extension management
- Future auth (Supabase Auth)

Architecture remains:
- **Database**: Supabase (PostgreSQL 15+ with PostGIS)
- **Images**: Cloudinary (not Supabase Storage)
- **Auth**: Supabase Auth (future)

## Rationale
- Same underlying technology (PostgreSQL + PostGIS) as ADR-002 intended
- Zero ops overhead for a thesis project with a single developer
- Supabase free tier (500MB database) is sufficient for MVP
- Supabase Auth will eliminate the need for a separate auth service
- The codebase already uses `@supabase/supabase-js` — no additional dependency

## Consequences
### Positive
- No database server to manage — Supabase handles infrastructure
- PostGIS available as one-click extension
- Future Supabase Auth integration is seamless
- Database scales from free tier without migration
- Built-in REST API and TypeScript type generation

### Negative / Trade-offs
- Vendor dependency on Supabase (but PostgreSQL is standard — can export and self-host later)
- Free tier limits: 500MB database, 5GB bandwidth, 2 concurrent connections
- Cannot run custom PostgreSQL extensions beyond what Supabase offers

### Risks
- Supabase free tier row limits (not enforced but monitored) — mitigated by JSONB storage efficiency
- Supabase downtime — mitigated by localStorage as fallback cache

## Alternatives Considered
### Option A: Self-managed PostgreSQL (original ADR-002)
Rejected — adds operational overhead (server, backups, TLS, connection pooling) that is disproportionate for a thesis project. Supabase is the same PostgreSQL underneath.

### Option B: SQLite + server file
Rejected — doesn't work with Vercel's serverless architecture (ephemeral filesystem).

### Option C: PlanetScale (MySQL)
Rejected — no PostGIS support, which is required for spatial queries (nearest node, boundary containment).

## Impact on Other Roles
- Developer: Continue using `@supabase/supabase-js` patterns already established
- QA: Test persistence across sessions as thesis must-have criterion
- DevOps: Document Supabase project setup and env var configuration
- Docs: Update database connection guide and schema reference
