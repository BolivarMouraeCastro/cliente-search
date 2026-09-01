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
    // Redirect to login page if not authenticated
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
