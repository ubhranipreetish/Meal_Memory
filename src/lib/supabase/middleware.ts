/**
 * Refreshes the Supabase auth session on every request and guards routes.
 * Called from the root middleware.ts.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

function isPublicPath(path: string) {
  return (
    path === "/login" ||
    path === "/auth" ||
    path.startsWith("/auth/") ||
    path === "/preview" ||
    path.startsWith("/preview/") ||
    path.startsWith("/api/cron/")
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  // Not signed in and on a protected route → send to login.
  if ((error || !data?.claims.sub) && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
