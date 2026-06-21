# Task 3: Create auth/callback/route.ts for OAuth redirect

**Create:** `src/app/auth/callback/route.ts`

**Context:** This handles the OAuth redirect callback from Google. After the user authenticates with Google, Supabase sends them here with a `code` query param. This route exchanges the code for a session cookie and redirects to the admin dashboard.

## Implementation

Create directories `src/app/auth/callback/` with a `route.ts` file:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/dashboard";

  if (code) {
    let supabaseResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.redirect(`${origin}${next}`);
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return supabaseResponse;
    }
  }

  return NextResponse.redirect(`${origin}/admin/login?error=auth_failed`);
}
```

## Verification

```bash
cmd /c "npm run lint"
```
Expected: 0 errors (pre-existing warnings only)

## Interface
- Produces: `src/app/auth/callback/route.ts` — handles GET requests from OAuth redirect
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Depends on: @supabase/ssr (installed in Task 1), middleware.ts allowing `/auth/*` (Task 2)
