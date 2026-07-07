---
tags: [#role/architect, #status/planning]
date: 2026-06-20
title: "ADR-006: Auth Strategy — Supabase Auth + Google OAuth"
---

# ADR-006: Auth Strategy — Supabase Auth + Google OAuth

## Status
Proposed

## Context
NAVI has two user roles:
- **Admin**: Can edit maps, manage panoramas, generate QR codes
- **Public**: Read-only map access, no authentication required

Future: Multi-campus admin roles (super admin, campus admin, mapping staff).

## Decision
1. **Supabase Auth** for all authentication (built-in, no extra service).
2. **Google OAuth** as the primary login method (most ASU users have Google accounts).
3. **Email/password** as fallback for non-Google users.
4. **Row-Level Security (RLS)** in Supabase: public read access to graph_snapshots, admin write access.
5. **Next.js middleware** protects `/admin/*` routes, redirects to `/login`.
6. **Session**: Supabase cookie-based session via `@supabase/ssr`.
7. **Role model**: Simple `is_admin` flag on `public.users` table (extended from auth.users via trigger).

## Alternatives Considered
- **NextAuth.js**: More flexible but adds complexity → Supabase Auth is simpler for Supabase-backed apps.
- **Clerk**: Paid at scale → overkill for thesis scope.
- **Magic link**: Good UX but email deliverability issues → Google OAuth simpler.

## Consequences
- Google OAuth requires Supabase project config (Google Cloud Console credentials).
- RLS policies must be written for every table.
- `@supabase/ssr` package required for server-side session handling.
- Future: RLS can be extended for per-campus admin access.

## Links
- [[full-system-plan]]
