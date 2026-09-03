import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthorized, isPublicPath } from "@/lib/auth/passcode";

/** Passcode gate (see lib/auth/passcode.ts). Off when APP_PASSCODE is unset. */
export default async function proxy(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (await isAuthorized(req.cookies.get(AUTH_COOKIE)?.value, passcode)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except static assets; API routes included on purpose.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
