/**
 * Central runtime configuration.
 *
 * Previously the JWT secret and other settings were read (with the same weak
 * fallbacks) in several route modules. That made it easy to forget one and
 * silently ship a forgeable-token deployment. Everything now resolves here.
 */

const DEV_JWT_FALLBACK = "dev-only-insecure-jwt-secret-do-not-use-in-production";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (secret && secret.length > 0) {
    if (isProduction && secret.length < 32) {
      throw new Error(
        "JWT_SECRET is too short for production (minimum 32 characters). " +
          "Generate one with: openssl rand -hex 32",
      );
    }
    return secret;
  }

  if (isProduction) {
    throw new Error(
      "JWT_SECRET is required in production. " +
        "Generate one with: openssl rand -hex 32 and set it in the environment.",
    );
  }

  // Development only — loud, deterministic, and never valid in production.
  return DEV_JWT_FALLBACK;
}

export const JWT_SECRET = resolveJwtSecret();

export const JWT_EXPIRY = "8h";

/** Minimum password length enforced everywhere (was 4 — too weak). */
export const MIN_PASSWORD_LENGTH = 8;

/** Student session token length in bytes (hex-encoded → 64 chars). */
export const SESSION_TOKEN_BYTES = 32;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
