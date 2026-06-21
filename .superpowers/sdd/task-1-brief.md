# Task 1: Install dependency + create client files

**Files:**
- Create: `src/lib/supabase-client.ts`
- Modify: `src/lib/supabase-server.ts`

**Context:** This is the first task in replacing NAVI's mock auth with Supabase Auth. It installs @supabase/ssr and creates the browser/server client helpers that all other tasks depend on.

## Step 1: Install @supabase/ssr

```bash
npm install @supabase/ssr
```

## Step 2: Create `src/lib/supabase-client.ts`

Create a new file with `createBrowserClient` from `@supabase/ssr`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

## Step 3: Rewrite `src/lib/supabase-server.ts`

Replace the current singleton admin client (uses `createClient` from `@supabase/supabase-js`) with @supabase/ssr's `createServerClient` for cookie-based requests. Keep the import of `createAdminClient` from `@supabase/server/core` for admin contexts.

The file should only export the cookie-based `createClient` for server components:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    },
  );
}
```

After this task, `getSupabaseContext` and `createAdminClient` from the previous implementation should remain available (keep the old exports or re-export from @supabase/server).

## Step 4: Verify lint

```bash
npm run lint
```
Expected: 0 errors (pre-existing warnings only)

## Interfaces
- Produces: `supabase-client.ts` → exports `createClient()` for browser
- Produces: `supabase-server.ts` → exports `createClient()` for server components, plus re-exports `getSupabaseContext` and `createAdminClient`
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
