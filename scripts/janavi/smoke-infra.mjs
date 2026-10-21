#!/usr/bin/env node
/**
 * JANAVI infrastructure smoke check (no new deps beyond ioredis).
 *
 * Usage: node scripts/janavi/smoke-infra.mjs
 *
 * - When JANAVI env vars are absent it prints "env not configured" and exits 0.
 * - When present it:
 *     1. opens a raw TCP connection (node:net — no pg dependency) to
 *        DB_HOST:DB_PORT (or DATABASE_URL host/port) and reports success;
 *     2. connects to Redis Cloud via ioredis (REDIS_URL or
 *        REDIS_HOST/REDIS_PORT), PINGs it and round-trips a single key under
 *        the janavi:dev: prefix (SET/GET/DEL of its own smoke key only —
 *        nothing else is read, written, or flushed).
 *
 * Secrets are never printed.
 */

import net from "node:net";

const dbHost = process.env.DB_HOST?.trim();
const dbPort = Number(process.env.DB_PORT || 5432);
const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const redisHost = process.env.REDIS_HOST?.trim();
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPrefix = process.env.JANAVI_REDIS_PREFIX?.trim() || "janavi:dev:";

if (!dbHost && !databaseUrl && !redisUrl && !redisHost) {
  console.log("env not configured");
  process.exit(0);
}

function checkTcp(host, port, label) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok, detail) => {
      socket.removeAllListeners();
      socket.destroy();
      console.log(`  ${label}: ${ok ? "OK" : "FAIL"}${detail ? ` — ${detail}` : ""}`);
      resolve(ok);
    };
    socket.setTimeout(5000);
    socket.once("connect", () => finish(true, `TCP connect to ${host}:${port} succeeded`));
    socket.once("timeout", () => finish(false, `timed out connecting to ${host}:${port}`));
    socket.once("error", (error) => finish(false, `${host}:${port} — ${error.message}`));
  });
}

function parsePostgres(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return null;
    }
    return {
      host: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : 5432,
    };
  } catch {
    return null;
  }
}

const results = [];

console.log("janavi smoke-infra");

// --- Postgres (raw TCP connect; no pg dependency, no credentials sent) -----
let pgTarget = null;
if (dbHost) {
  pgTarget = { host: dbHost, port: dbPort };
} else if (databaseUrl) {
  const parsed = parsePostgres(databaseUrl);
  if (!parsed) {
    console.log("  postgres: SKIP — DATABASE_URL is set but is not a postgresql:// URL");
  }
  pgTarget = parsed;
}
if (pgTarget?.host) {
  results.push(await checkTcp(pgTarget.host, pgTarget.port, "postgres"));
} else if (!databaseUrl) {
  console.log("  postgres: SKIP — DB_HOST / DATABASE_URL not set");
}

// --- Redis Cloud (ioredis) --------------------------------------------------
if (redisUrl || redisHost) {
  const { default: Redis } = await import("ioredis");
  const client = redisUrl
    ? new Redis(redisUrl, {
        keyPrefix: redisPrefix,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: true,
        lazyConnect: false,
        ...(redisUrl.startsWith("rediss://") ? { tls: {} } : {}),
      })
    : new Redis({
        host: redisHost,
        port: redisPort,
        ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        keyPrefix: redisPrefix,
        maxRetriesPerRequest: 2,
        enableOfflineQueue: true,
        lazyConnect: false,
      });

  client.on("error", (error) => {
    console.warn(`  redis: connection error — ${error.message}`);
  });

  const smokeKey = `${redisPrefix}smoke-infra`;
  try {
    const pong = await client.ping();
    console.log(`  redis: OK — PING -> ${pong}, prefix "${redisPrefix}"`);
    // Round-trip exactly one self-owned key (short TTL, then deleted).
    await client.set(smokeKey, "ping", "EX", 60);
    const value = await client.get(smokeKey);
    await client.del(smokeKey);
    console.log(
      `  redis: ${value === "ping" ? "OK" : "FAIL"} — SET/GET/DEL round-trip on "${smokeKey}"`,
    );
    results.push(pong === "PONG" && value === "ping");
  } catch (error) {
    console.log(`  redis: FAIL — ${error.message}`);
    results.push(false);
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
} else {
  console.log("  redis: SKIP — REDIS_URL / REDIS_HOST not set");
}

const failed = results.some((ok) => !ok);
console.log(failed ? "smoke-infra: FAILED" : "smoke-infra: PASSED");
process.exit(failed ? 1 : 0);
