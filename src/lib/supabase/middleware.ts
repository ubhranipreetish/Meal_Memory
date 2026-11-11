/**
 * Refreshes the Supabase auth session on every request and guards routes.
 * Called from the root proxy.ts.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

function isPublicPath(path: string) {
  return (
    path === "/" ||
    path === "/login" ||
    path === "/demo/meal-memory-story.mp4" ||
    path === "/demo/meal-memory-story.vtt" ||
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
  const signedIn = !error && Boolean(data?.claims.sub);
  const destination = signedIn && path === "/"
    ? "/home"
    : !signedIn && !isPublicPath(path) ? "/" : null;

  if (destination) {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
