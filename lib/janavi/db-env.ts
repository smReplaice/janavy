/**
 * JANAVI database environment composition.
 *
 * JANAVI runs on a dedicated AWS RDS PostgreSQL instance (region ap-south-1)
 * with its own database, `janavi_dev`. It must NEVER be pointed at the
 * `engage` database. No Docker databases are used.
 *
 * The Prisma schema (prisma/schema/schema.prisma) reads:
 *   - `POSTGRES_PRISMA_URL`             (datasource url)
 *   - `POSTGRES_PRISMA_URL_NON_POOLING` (datasource directUrl)
 *   - `POSTGRES_PRISMA_SHADOW_URL`      (shadowDatabaseUrl, `prisma migrate dev` only)
 *
 * PrismaClient resolves `env()` URLs when the client is constructed, so
 * writing `process.env` before `new PrismaClient()` (see lib/prisma.ts) is
 * enough at runtime. The Prisma CLI (`prisma migrate`) does NOT run our
 * application code, so it reads these variables directly from the shell —
 * see `.env.janavi.example` for a commented example of composing them from
 * the DB_* variables below.
 */

/** Default database name on the dedicated JANAVI RDS instance. */
const DEFAULT_JANAVI_DATABASE = "janavi_dev";

/** Default PostgreSQL port. */
const DEFAULT_JANAVI_PORT = 5432;

function toDisplayUrl(url: string): string {
  // Defensive: strip anything that looks like credentials before logging.
  return url.replace(/\/\/[^@/]*@/, "//***@");
}

/**
 * Build the JANAVI PostgreSQL connection URL.
 *
 * Resolution order:
 *  1. `DATABASE_URL` when set (used verbatim, except that SSL parameters are
 *     appended when missing — see below).
 *  2. Composed from `DB_HOST`, `DB_PORT` (default 5432), `DB_USERNAME`,
 *     `DB_PASSWORD` and `DB_DATABASE` (default `janavi_dev`).
 *
 * SSL parameters:
 *  - `sslmode=verify-full` (default) unless `JANAVI_DB_SSL=disabled`, in
 *    which case `sslmode=require` is used.
 *  - `sslcert=<JANAVI_DB_CA_CERT_PATH>` appended when that env var is set.
 *
 * The `pooling` option is accepted for future use; today both variants are
 * identical (no pooling parameters such as pgbouncer flags are appended —
 * JANAVI keeps a simple direct connection string).
 *
 * Returns undefined when neither `DATABASE_URL` nor `DB_HOST` is set.
 */
export function composeJanaviDatabaseUrl(opts?: {
  pooling?: boolean;
}): string | undefined {
  void opts; // intentionally unused; kept for API stability

  const appendSslParams = (url: string): string => {
    if (/([?&])sslmode=/.test(url)) {
      // Caller already pinned an sslmode; respect it as-is.
      return url;
    }
    const sslmode =
      process.env.JANAVI_DB_SSL === "disabled" ? "require" : "verify-full";
    const separator = url.includes("?") ? "&" : "?";
    let composed = `${url}${separator}sslmode=${sslmode}`;
    const caCertPath = process.env.JANAVI_DB_CA_CERT_PATH;
    if (caCertPath && !/([?&])sslcert=/.test(url)) {
      composed += `&sslcert=${encodeURIComponent(caCertPath)}`;
    }
    return composed;
  };

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return appendSslParams(databaseUrl);
  }

  const host = process.env.DB_HOST?.trim();
  if (!host) {
    return undefined;
  }

  const port = process.env.DB_PORT?.trim() || String(DEFAULT_JANAVI_PORT);
  const database = process.env.DB_DATABASE?.trim() || DEFAULT_JANAVI_DATABASE;
  const username = process.env.DB_USERNAME?.trim() ?? "";
  const password = process.env.DB_PASSWORD ?? "";

  const credentials = username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : "";

  return appendSslParams(
    `postgresql://${credentials}${host}:${port}/${database}`,
  );
}

let applied = false;

/**
 * Populate the Prisma runtime env vars from the JANAVI DB_* configuration.
 *
 * Idempotent (safe to call repeatedly; module-level flag):
 *  - sets `POSTGRES_PRISMA_URL` if unset and a URL could be composed;
 *  - sets `POSTGRES_PRISMA_URL_NON_POOLING` if unset and a URL could be composed;
 *  - NEVER touches `POSTGRES_PRISMA_SHADOW_URL`. Migrations (`prisma migrate dev`)
 *    use the shadow database URL and the Prisma CLI reads it directly from the
 *    environment — compose it manually per `.env.janavi.example` when needed.
 */
export function applyJanaviDatabaseEnv(): void {
  if (applied) {
    return;
  }
  applied = true;

  const url = composeJanaviDatabaseUrl();
  if (!url) {
    return;
  }

  if (!process.env.POSTGRES_PRISMA_URL) {
    process.env.POSTGRES_PRISMA_URL = url;
  }
  if (!process.env.POSTGRES_PRISMA_URL_NON_POOLING) {
    process.env.POSTGRES_PRISMA_URL_NON_POOLING = url;
  }
  // POSTGRES_PRISMA_SHADOW_URL is intentionally left alone (see docstring).
}

/** Human-readable description of every JANAVI database env variable. */
export const JANAVI_DB_ENV_DOC = `
JANAVI database environment variables
=====================================
All values are read from the environment; nothing is hardcoded.

  DB_HOST                  AWS RDS PostgreSQL endpoint (region ap-south-1).
  DB_PORT                  PostgreSQL port (default: 5432).
  DB_USERNAME              Database user (URL-encoded when composing the URL).
  DB_PASSWORD              Database password (URL-encoded when composing the URL).
  DB_DATABASE              Database name (default: janavi_dev). Dedicated JANAVI
                           database — NEVER point this at the "engage" database.
  DATABASE_URL             Optional full PostgreSQL URL. When set it takes
                           precedence over the DB_* variables (SSL params are
                           appended if missing).
  JANAVI_DB_SSL            Set to "disabled" to relax sslmode from
                           "verify-full" to "require". Default: verify-full.
  JANAVI_DB_CA_CERT_PATH   Path to the downloaded AWS RDS combined CA bundle
                           (global-bundle.pem). Appended as sslcert= when set.

Derived at runtime (see lib/prisma.ts + lib/janavi/db-env.ts):
  POSTGRES_PRISMA_URL              set from the composed URL when unset.
  POSTGRES_PRISMA_URL_NON_POOLING  set from the composed URL when unset.
  POSTGRES_PRISMA_SHADOW_URL       never set automatically; "prisma migrate
                                   dev" reads it straight from the environment.

Example display URL (credentials never logged):
  postgresql://***@<db-host>:5432/janavi_dev?sslmode=verify-full
`.trim();

export { toDisplayUrl };
