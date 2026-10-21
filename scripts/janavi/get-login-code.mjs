#!/usr/bin/env node
/**
 * JANAVI QA helper: read an email login code from Redis.
 *
 * The login flow (lib/emails/send-verification-request.ts) stores the code
 * under "<prefix>login_code:email:<email>:<code>" with a 15-minute TTL.
 * This script is the QA "mailbox": it polls for the newest key for the
 * given email and prints JUST the code on stdout (exit 1 on timeout).
 *
 * Usage: node --env-file=.env scripts/janavi/get-login-code.mjs <email> [timeoutMs]
 *
 * Only keys under the JANAVI prefix are ever read; nothing is written.
 */
const email = process.argv[2];
if (!email) {
  console.error("usage: get-login-code.mjs <email> [timeoutMs]");
  process.exit(2);
}
const timeoutMs = Number(process.argv[3] || 30_000);

const redisUrl = process.env.REDIS_URL?.trim();
const redisHost = process.env.REDIS_HOST?.trim();
const redisPrefix = process.env.JANAVI_REDIS_PREFIX?.trim() || "janavi:dev:";

if (!redisUrl && !redisHost) {
  console.error("redis not configured (REDIS_URL / REDIS_HOST)");
  process.exit(2);
}

const { default: Redis } = await import("ioredis");

const client = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      ...(redisUrl.startsWith("rediss://") ? { tls: {} } : {}),
    })
  : new Redis({
      host: redisHost,
      port: Number(process.env.REDIS_PORT || 6379),
      ...(process.env.REDIS_USERNAME
        ? { username: process.env.REDIS_USERNAME }
        : {}),
      ...(process.env.REDIS_PASSWORD
        ? { password: process.env.REDIS_PASSWORD }
        : {}),
      maxRetriesPerRequest: 2,
    });

client.on("error", () => {
  /* surfaced via scan failures below */
});

// The client is created WITHOUT keyPrefix so the pattern below addresses the
// full physical key including the JANAVI prefix (read-only SCAN + GET).
const normalizedEmail = email.trim().toLowerCase();
const pattern = `${redisPrefix}login_code:email:${normalizedEmail}:*`;

function scanAll(match) {
  return new Promise((resolve, reject) => {
    const stream = client.scanStream({ match, count: 100 });
    const keys = [];
    stream.on("data", (chunk) => keys.push(...chunk));
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}

const deadline = Date.now() + timeoutMs;
try {
  while (Date.now() < deadline) {
    const keys = await scanAll(pattern);
    if (keys.length > 0) {
      // Newest key wins (codes can be re-requested).
      const values = await client.mget(...keys);
      let newest = null;
      let newestCreatedAt = -1;
      for (const value of values) {
        if (!value) continue;
        try {
          const parsed = JSON.parse(value);
          if (
            typeof parsed.createdAt === "number" &&
            parsed.createdAt > newestCreatedAt
          ) {
            newestCreatedAt = parsed.createdAt;
            newest = parsed;
          }
        } catch {
          /* skip non-JSON payloads */
        }
      }
      const code =
        newest?.code ??
        keys[keys.length - 1].slice(keys[keys.length - 1].lastIndexOf(":") + 1);
      if (code) {
        console.log(code);
        process.exit(0);
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.error(`no login code found for ${normalizedEmail} within ${timeoutMs}ms`);
  process.exit(1);
} finally {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
