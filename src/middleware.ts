import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow auth endpoints, static files, favicon, and public assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg")
  ) {
    return NextResponse.next();
  }

  // Allow the login page always
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Check authentication for protected routes
  const token = await getToken({ req: request });

  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Check if user is revoked (kicked by admin)
  const email = (token.email as string)?.toLowerCase();
  if (email && !pathname.startsWith("/api/admin/revoke")) {
    try {
      const checkUrl = new URL("/api/admin/revoke", request.nextUrl.origin);
      checkUrl.searchParams.set("email", email);
      const res = await fetch(checkUrl.toString(), {
        headers: { cookie: request.headers.get("cookie") || "" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.revoked) {
          // Clear session and redirect to login
          const url = request.nextUrl.clone();
          url.pathname = "/login";
          url.searchParams.set("kicked", "true");
          const response = NextResponse.redirect(url);
          // Delete the session cookie
          response.cookies.delete("next-auth.session-token");
          response.cookies.delete("__Secure-next-auth.session-token");
          return response;
        }
      }
    } catch {
      // Don't block if check fails
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
