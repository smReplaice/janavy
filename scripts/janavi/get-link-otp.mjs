#!/usr/bin/env node
/**
 * JANAVI QA helper: read a link-access email OTP from PostgreSQL.
 *
 * The link email-verification flow (app/api/views/route.ts) stores the OTP
 * in the VerificationToken table with identifier `otp:<linkId>:<email>`.
 * This script polls for the token and prints JUST the OTP on stdout
 * (exit 1 on timeout).
 *
 * Usage: node --env-file=.env scripts/janavi/get-link-otp.mjs <linkId> <email> [timeoutMs]
 *
 * Read-only; only rows created by the OTP flow are queried.
 */
const linkId = process.argv[2];
const email = process.argv[3];
if (!linkId || !email) {
  console.error("usage: get-link-otp.mjs <linkId> <email> [timeoutMs]");
  process.exit(2);
}
const timeoutMs = Number(process.argv[4] || 30_000);
const identifier = `otp:${linkId}:${email.trim().toLowerCase()}`;

// Compose POSTGRES_PRISMA_URL from the JANAVI DB_* variables exactly like
// lib/janavi/db-env.ts does (PrismaClient resolves env() at construction).
function composeUrl() {
  const appendSsl = (url) => {
    if (/([?&])sslmode=/.test(url)) return url;
    const sslmode =
      process.env.JANAVI_DB_SSL === "disabled" ? "require" : "verify-full";
    return `${url}${url.includes("?") ? "&" : "?"}sslmode=${sslmode}`;
  };
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return appendSsl(databaseUrl);
  const host = process.env.DB_HOST?.trim();
  if (!host) return undefined;
  const port = process.env.DB_PORT?.trim() || "5432";
  const database = process.env.DB_DATABASE?.trim() || "janavi_dev";
  const username = process.env.DB_USERNAME?.trim() ?? "";
  const password = process.env.DB_PASSWORD ?? "";
  const credentials = username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : "";
  return appendSsl(
    `postgresql://${credentials}${host}:${port}/${database}`,
  );
}

const url = process.env.POSTGRES_PRISMA_URL || composeUrl();
if (!url) {
  console.error("database not configured (DB_HOST / DATABASE_URL)");
  process.exit(2);
}
process.env.POSTGRES_PRISMA_URL = url;
process.env.POSTGRES_PRISMA_URL_NON_POOLING ||=
  process.env.POSTGRES_PRISMA_URL_NON_POOLING || url;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const deadline = Date.now() + timeoutMs;
try {
  while (Date.now() < deadline) {
    // identifier+token is the composite unique key and the token is what we
    // are looking for, so query by identifier alone.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT token FROM "VerificationToken" WHERE identifier = $1 ORDER BY expires DESC LIMIT 1`,
      identifier,
    );
    if (rows && rows.length > 0 && rows[0].token) {
      console.log(rows[0].token);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.error(`no OTP found for ${identifier} within ${timeoutMs}ms`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
