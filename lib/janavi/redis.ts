/**
 * JANAVI Redis Cloud connection (standard RESP protocol, NOT Upstash REST).
 *
 * JANAVI uses an existing Redis Cloud instance via `ioredis`. Every key the
 * application writes goes through this client and is automatically prefixed
 * with `JANAVI_REDIS_PREFIX` (default "janavi:dev:") via ioredis `keyPrefix`,
 * so JANAVI data is namespaced and nothing outside the prefix is ever read
 * or written. The connection is never flushed.
 *
 * Configuration (see .env.janavi.example):
 *   REDIS_URL             Preferred. May be redis:// or rediss:// (TLS is
 *                         enabled automatically for rediss://).
 *   REDIS_HOST/REDIS_PORT Alternative host/port form (default port 6379).
 *   REDIS_PASSWORD        Optional password (or the password part of REDIS_URL).
 *   REDIS_USERNAME        Optional ACL username (Redis 6+ ACL / Redis Cloud).
 *   JANAVI_REDIS_PREFIX   Key prefix, default "janavi:dev:".
 */
/**
 * ioredis is Node-only (node:net / node:tls / node:diagnostics_channel) and
 * must never be reachable from the edge middleware bundle. The edge-safe
 * entry points (lib/middleware/*) do not import the shared redis facade;
 * as defense in depth `getJanaviRedis()` still returns null on the edge
 * runtime so the facade degrades to its documented no-Redis stub there.
 */
import Redis from "ioredis";

type IORedisClient = import("ioredis").default;

export type JanaviRedisConfig = {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  /** TLS is enabled automatically for rediss:// URLs. */
  tls: boolean;
  /** Every key is prefixed with this (default "janavi:dev:"). */
  prefix: string;
};

/**
 * Read the JANAVI Redis configuration from the environment.
 * Returns null when neither REDIS_URL nor REDIS_HOST is configured.
 */
export function janaviRedisConfig(): JanaviRedisConfig | null {
  const prefix = janaviRedisKeyPrefix();

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      const dbSegment = parsed.pathname.replace(/^\//, "");
      const db = dbSegment ? Number.parseInt(dbSegment, 10) : NaN;
      return {
        host: parsed.hostname || "127.0.0.1",
        port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
        password: parsed.password || undefined,
        username: parsed.username || undefined,
        db: Number.isFinite(db) ? db : undefined,
        tls: parsed.protocol === "rediss:",
        prefix,
      };
    } catch {
      console.warn(
        "[janavi-redis] REDIS_URL is set but could not be parsed; falling back to REDIS_HOST.",
      );
    }
  }

  const host = process.env.REDIS_HOST?.trim();
  if (host) {
    // Host/port form has no scheme to derive TLS from; use a rediss://
    // REDIS_URL when TLS is required in host/port mode.
    return {
      host,
      port: process.env.REDIS_PORT
        ? Number.parseInt(process.env.REDIS_PORT, 10)
        : 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      username: process.env.REDIS_USERNAME || undefined,
      db: undefined,
      tls: false,
      prefix,
    };
  }

  return null;
}

/** The key prefix every JANAVI key carries (default "janavi:dev:"). */
export function janaviRedisKeyPrefix(): string {
  return process.env.JANAVI_REDIS_PREFIX?.trim() || "janavi:dev:";
}

let janaviRedis: IORedisClient | null = null;

/**
 * Lazily-created singleton ioredis client for the JANAVI Redis Cloud instance.
 * Returns null when REDIS_URL/REDIS_HOST are not configured.
 *
 * Connection errors are logged as console warnings and never crash the app.
 */
export function getJanaviRedis(): IORedisClient | null {
  if (janaviRedis) {
    return janaviRedis;
  }

  // Edge runtime cannot host ioredis connections; degrade to stub mode.
  if (process.env.NEXT_RUNTIME === "edge") {
    return null;
  }

  const config = janaviRedisConfig();
  if (!config) {
    return null;
  }

  const client: IORedisClient = new Redis({
    host: config.host,
    port: config.port,
    ...(config.username ? { username: config.username } : {}),
    ...(config.password ? { password: config.password } : {}),
    ...(config.db !== undefined ? { db: config.db } : {}),
    keyPrefix: config.prefix,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    lazyConnect: false,
    ...(config.tls ? { tls: {} } : {}),
  });

  // Never crash the app because of Redis connectivity problems. If the
  // connection dies unrecoverably, drop the singleton so the next call
  // constructs a fresh client (self-healing for long-lived processes).
  client.on("error", (error: unknown) => {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    console.warn(`[janavi-redis] connection error: ${message}`);
    if (client.status === "end" || client.status === "close") {
      if (janaviRedis === client) janaviRedis = null;
    }
  });

  janaviRedis = client;
  return client;
}

/**
 * Close the singleton connection (used by scripts/tests so the process can
 * exit). Safe to call when no connection exists.
 */
export async function closeJanaviRedis(): Promise<void> {
  const client = janaviRedis;
  janaviRedis = null;
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
