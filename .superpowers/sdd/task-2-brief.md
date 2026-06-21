# Task 2: Create middleware.ts with route protection

**Create:** `src/middleware.ts`

**Context:** This creates Next.js middleware to protect admin routes using Supabase session cookies. Runs before every request.

## Route protection rules

| Route | Unauthenticated | Authenticated |
|-------|----------------|---------------|
| `/admin/login` | Allow | Redirect to `/admin/dashboard` |
| `/admin/*` | Redirect to `/admin/login` | Allow |
| `/auth/callback` | Allow | Allow |
| `/` (home) | Allow | Allow |
| `/(public)/*` | Allow | Allow |
| any API route `/api/*` | Allow | Allow |

## Implementation

Create `src/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginPage = pathname === "/admin/login";
  const isAuthCallback = pathname.startsWith("/auth");

  if (isAuthCallback) {
    return supabaseResponse;
  }

  if (!user && isAdminRoute && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

## Verification

```bash
npm run lint
```
Expected: 0 errors (pre-existing warnings only)

## Interface
- Produces: `middleware.ts` with `middleware` function + `config.matcher`
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Depends on: @supabase/ssr (installed in Task 1)
