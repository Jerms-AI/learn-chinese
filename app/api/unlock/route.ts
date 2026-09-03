import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, COOKIE_MAX_AGE_S, passcodeMatches, tokenFor } from "@/lib/auth/passcode";

export const runtime = "nodejs";

/** Plain HTML form POST from /unlock. Sets the auth cookie on success and
 *  bounces back to the app; on failure returns to /unlock with ?error=1. */
export async function POST(req: NextRequest) {
  const passcode = process.env.APP_PASSCODE;
  const origin = req.nextUrl.origin;
  if (!passcode) return NextResponse.redirect(`${origin}/`, 303);

  const form = await req.formData();
  const submitted = String(form.get("passcode") ?? "");
  if (!passcodeMatches(submitted, passcode)) {
    return NextResponse.redirect(`${origin}/unlock?error=1`, 303);
  }

  const res = NextResponse.redirect(`${origin}/`, 303);
  res.cookies.set(AUTH_COOKIE, await tokenFor(passcode), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}
