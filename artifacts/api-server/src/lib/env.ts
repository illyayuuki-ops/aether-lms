/**
 * Environment access in one place.
 *
 * SEC-05: a missing secret must never quietly become a constant that is
 * published in this repository. In production the process refuses to start;
 * in development it falls back so that `pnpm preview` and local runs work.
 *
 * This module exists so the fallback is written down once. It used to be
 * copy-pasted into four route files, which is how a "temporary" default
 * becomes permanent.
 */

const DEV_FALLBACK = "library-jwt-secret-change-me";
const isProduction = process.env.NODE_ENV === "production";

/**
 * Secret used to sign and verify tokens.
 *
 * Throws in production when unset — a wrong secret breaks authentication
 * loudly instead of silently accepting tokens signed with a public string.
 */
export function jwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (value && value.length > 0) return value;
  if (isProduction) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start in production with the development fallback (SEC-05).",
    );
  }
  return DEV_FALLBACK;
}

/** True when the configured secret is the development fallback. */
export function usingFallbackSecret(): boolean {
  return !process.env.JWT_SECRET;
}
