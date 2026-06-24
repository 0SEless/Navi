import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const adminPrefixes = ["/dashboard", "/panoramas", "/qr", "/routes", "/dataset", "/studio"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = adminPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isLoginPage = pathname === "/login";
  const isAuthCallback = pathname.startsWith("/auth");

  if (isAuthCallback) return NextResponse.next({ request });
  if (!isAdminRoute && !isLoginPage) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && isAdminRoute && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/panoramas/:path*", "/qr/:path*", "/routes/:path*", "/dataset/:path*", "/studio/:path*", "/login", "/auth/:path*"],
};
