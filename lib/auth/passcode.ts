/**
 * Passcode gate for the hosted app. Solo use, no accounts: one shared
 * APP_PASSCODE env var. The browser stores a derived token (not the passcode)
 * in an httpOnly cookie; the proxy checks it on every request so nobody who
 * stumbles on the URL can burn the STT/TTS/LLM credit behind it.
 *
 * Unset APP_PASSCODE (local dev) → the gate is off.
 * Web Crypto only — this runs in the Next proxy as well as route handlers.
 */

export const AUTH_COOKIE = "lc_auth";
export const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365; // a year — it's a phone, not a bank

/** Paths that must stay reachable without the cookie. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/unlock" ||
    pathname === "/api/unlock" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cookie value for a given passcode. Domain-separated so a leaked token
 *  isn't a plain hash of the passcode. */
export function tokenFor(passcode: string): Promise<string> {
  return sha256Hex(`learn-chinese:v1:${passcode}`);
}

/** Constant-time string compare (both hex, same length when valid). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the request's cookie proves knowledge of the passcode. */
export async function isAuthorized(cookieValue: string | undefined, passcode: string): Promise<boolean> {
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await tokenFor(passcode));
}

/** True when the submitted passcode matches. */
export function passcodeMatches(submitted: string, passcode: string): boolean {
  return safeEqual(submitted, passcode);
}
