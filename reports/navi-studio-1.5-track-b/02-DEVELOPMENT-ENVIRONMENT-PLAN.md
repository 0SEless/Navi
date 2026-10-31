# Development Environment Plan

**Target:** A separate Vercel project named `navi-development`, attached only to Supabase project reference `scvgulusmutnzasmgysx`. This document is a plan; no project or environment was created or changed.

## Required environment contract

| Variable | Scope | Value requirement |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Development; client and server | `https://scvgulusmutnzasmgysx.supabase.co` exactly. Verify project reference before adding credentials. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Development; public | Public/anon key issued by that same Development Supabase project. The candidate client, SSR client, middleware, public API reads, and Auth callback currently read this legacy name. |
| `SUPABASE_SERVICE_ROLE_KEY` | Development; server-only | Service-role key issued by that same Development project. Used by guarded graph and publish routes and panorama registry. Never prefix with `NEXT_PUBLIC_`. |
| `SUPABASE_URL` | Development; server/scripts if used | Same Development URL. `.env.example` defines it; it is also accepted by the safety guard. |
| `SUPABASE_PROJECT_REF` | Development; server/scripts if used | Literal `scvgulusmutnzasmgysx`; used by the fail-closed project guard. |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Development; server-only, optional only if uploads stay disabled | Use a dedicated Development bucket and credentials. If unavailable, omit all four so panorama upload fails closed. Never reuse Production R2. `R2_REGION` is optional and defaults to `auto`. |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Development; public, optional for map style | Development-approved public Mapbox token if the chosen map style requires it. |
| `NEXT_PUBLIC_API_URL` | Development only, if needed by client configuration | `http://localhost:3000` for local development; do not carry into hosted deployment unless code explicitly requires the app origin. |

`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, `NEXT_PUBLIC_MOCK_AUTH`, and Cloudinary variables exist in `.env.example` or tooling but are not required by the inspected runtime path for this plan. Do not add them by name alone: re-check code before creating a value. A Supabase Management API token is for operator tooling, not a Vercel runtime variable.

## Isolation and guard sequence

1. Create the Development Supabase project separately and verify its project reference in Dashboard/API settings before issuing its public and service credentials.
2. Create the separate Vercel project `navi-development`; do not attach the Production domain or import Production-scoped variables.
3. Add only Development-scoped variables above. Keep Production and Preview values out of this project. Do not place any secret under a `NEXT_PUBLIC_` name.
4. Configure Supabase Auth Site URL and allowed redirect URLs to the Development project’s exact Vercel domain and local callback `http://localhost:3000/auth/callback`. The current AuthProvider constructs the callback from `window.location.origin`; allow only the intended origins.
5. Configure OAuth providers with Development-specific credentials and callback URLs, if those providers are used. Do not reuse a Production OAuth client secret.
6. Disable/omit R2 variables until a separate Development bucket is provisioned; uploads then return the existing missing-configuration failure. Never point Development at Production R2.
7. Before any later write test, independently confirm project ref, Vercel project id, all resolved variable scopes, auth redirects, and R2 bucket. Exercise only a synthetic Development campus.
8. Verify Production variables/domains were not touched and the `navi-next.vercel.app` alias is not assigned to the Development project.

## Source evidence and limits

- `.env.example` lists the public URL/anon key, service key, project ref, optional newer key names, and R2/client variables.
- `src/lib/supabase.ts`, `src/lib/supabase-server.ts`, `src/lib/supabase-client.ts`, `src/middleware.ts`, and Auth callback read the `NEXT_PUBLIC_*` URL and anon-key names.
- `src/app/api/graph/route.ts`, `src/app/api/publish/route.ts`, and `src/lib/panorama-asset-store.ts` read `SUPABASE_SERVICE_ROLE_KEY` on server paths. Mutation routes also call the verified-auth/campus guards; service credentials alone are not user authorization.
- `src/lib/r2.ts` requires four server variables; R2 region defaults to `auto`.
- `src/lib/env-safety.ts` hard-codes the known Production project reference and refuses unknown/Production refs for guarded test tooling. It is not, by itself, a complete Vercel deployment-target guard.
- No existing Vercel project, Development credential, callback allowlist, or R2 bucket was queried. Those are future operator checks, not verified state.
