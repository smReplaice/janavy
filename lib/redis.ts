/**
 * Dual-transport Redis facade.
 *
 * Transport selection (resolved once at import time, never throws):
 *
 * 1. Redis Cloud mode (JANAVI): active when `REDIS_URL` or `REDIS_HOST` is
 *    set. Redis Cloud speaks the standard RESP protocol, which the Upstash
 *    REST client cannot talk to, so every export is served by an adapter over
 *    the shared `ioredis` singleton (lib/janavi/redis.ts). The adapter keeps
 *    the Upstash-REST-style call signatures and return semantics the app was
 *    written against (object `set` options, `zadd(key, { score, member })`,
 *    JSON auto-serialization on write, JSON auto-parse on read, `null` for
 *    missing keys, `sismember` returning 0/1).
 *    All keys are automatically prefixed with `JANAVI_REDIS_PREFIX`
 *    (default "janavi:dev:") via the ioredis `keyPrefix`, so JANAVI data is
 *    namespaced and nothing outside that prefix is ever read or written.
 *    `lockerRedisClient` reuses the exact same singleton: tus upload locks
 *    share the JANAVI Redis Cloud instance and get namespaced keys such as
 *    "janavi:dev:tus-lock-<id>".
 *
 * 2. Upstash REST mode (legacy papermark): active when only
 *    `UPSTASH_REDIS_REST_URL` is set. Behavior is identical to the previous
 *    implementation (`@upstash/redis` REST clients + `@upstash/ratelimit`).
 *
 * 3. Stub mode: when neither transport is configured, one console warning is
 *    logged and a safe stub is exported — reads resolve with null/empty
 *    values, writes are no-ops, and the rate limiter fails open. Importing
 *    this module never throws and never blocks.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  closeJanaviRedis,
  getJanaviRedis,
  janaviRedisKeyPrefix,
} from "@/lib/janavi/redis";

/* -------------------------------------------------------------------------- */
/* Shared facade types (Upstash-REST-shaped, derived from real call sites)     */
/* -------------------------------------------------------------------------- */

export type JanaviSetOptions = {
  ex?: number;
  px?: number;
  exat?: number;
  pxat?: number;
  keepTtl?: boolean;
  nx?: boolean;
  xx?: boolean;
  get?: boolean;
};

export type JanaviZRangeOptions = {
  byScore?: boolean;
  byLex?: boolean;
  rev?: boolean;
  limit?: { offset: number; count: number };
};

export type JanaviScoreMember =
  | { score: number; member: unknown }
  | [number, unknown];

export interface JanaviRedisPipeline {
  set(key: string, value: unknown, opts?: JanaviSetOptions): void;
  del(...keys: string[]): void;
  expire(key: string, seconds: number): void;
  sadd(key: string, member: unknown, ...members: unknown[]): void;
  rpush(key: string, ...values: unknown[]): void;
  exec(): Promise<unknown[]>;
}

export interface JanaviRedisFacade {
  get<TData = string>(key: string): Promise<TData | null>;
  getdel<TData = string>(key: string): Promise<TData | null>;
  set<TData = unknown>(
    key: string,
    value: TData,
    opts?: JanaviSetOptions,
  ): Promise<"OK" | TData | null>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<0 | 1>;
  setex<TData = string>(key: string, ttl: number, value: TData): Promise<"OK">;
  incr(key: string): Promise<number>;
  sadd<TData = string>(
    key: string,
    member: TData,
    ...members: TData[]
  ): Promise<number>;
  srem<TData = string>(key: string, ...members: TData[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember<TData = string>(key: string, member: TData): Promise<0 | 1>;
  lrange(key: string, start: number, end: number): Promise<string[]>;
  zadd(key: string, ...scores: JanaviScoreMember[]): Promise<number | null>;
  zrange(
    key: string,
    min: number,
    max: number,
    opts?: JanaviZRangeOptions,
  ): Promise<string[]>;
  zrem<TData = string>(key: string, ...members: TData[]): Promise<number>;
  hset<TData = string>(key: string, kv: Record<string, TData>): Promise<number>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  pipeline(): JanaviRedisPipeline;
  /**
   * Upstash-style script helpers — `(script, keys, args)` argument shape —
   * needed by `@upstash/ratelimit` consumers (e.g. ee/features/security).
   * Keys are prefixed with the JANAVI prefix because ioredis does not apply
   * keyPrefix to EVAL/EVALSHA keys.
   */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  evalsha(sha1: string, keys: string[], args: string[]): Promise<unknown>;
  /** Used by the ratelimit analytics ingest path. */
  zincrby(key: string, increment: number, member: unknown): Promise<number>;
}

export type JanaviRateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export interface JanaviRateLimiter {
  limit(identifier: string): Promise<JanaviRateLimitResult>;
}

export type JanaviDurationString =
  | `${number} ms`
  | `${number} s`
  | `${number} m`
  | `${number} h`
  | `${number} d`;

/* -------------------------------------------------------------------------- */
/* Transport selection                                                         */
/* -------------------------------------------------------------------------- */

type RedisTransport = "janavi" | "upstash" | "stub";

function resolveRedisTransport(): RedisTransport {
  if (process.env.REDIS_URL?.trim() || process.env.REDIS_HOST?.trim()) {
    return "janavi";
  }
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return "upstash";
  }
  console.warn(
    "[redis] No Redis transport configured (set REDIS_URL/REDIS_HOST for " +
      "JANAVI Redis Cloud, or UPSTASH_REDIS_REST_URL for Upstash REST). " +
      "Exporting a no-op stub.",
  );
  return "stub";
}

/**
 * Transport is resolved LAZILY (on first use) rather than at module init:
 * Next.js dev hot-reloads can re-evaluate this module before the process env
 * (from .env) is attached, which would otherwise pin an entire dev-server
 * session to stub mode — writes silently no-op while other code paths keep
 * working. Lazy resolution re-checks the environment at first command.
 */
const redisTransport = resolveRedisTransport();
let transportResolved = redisTransport !== "stub";

/** Construct the Upstash REST client pair (only used in upstash mode). */
function createUpstashClients(): {
  upstashMain: Redis;
  upstashLocker: Redis;
} {
  return {
    upstashMain: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    }),
    upstashLocker: new Redis({
      url: process.env.UPSTASH_REDIS_REST_LOCKER_URL as string,
      token: process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN as string,
    }),
  };
}

// Upstash clients are only constructed in Upstash mode so that importing this
// module can never throw when the Upstash env vars are absent.
let upstashRedis: Redis | null = null;
let upstashLockerRedis: Redis | null = null;
if (redisTransport === "upstash") {
  const { upstashMain, upstashLocker } = createUpstashClients();
  upstashRedis = upstashMain;
  upstashLockerRedis = upstashLocker;
}

/* -------------------------------------------------------------------------- */
/* Redis Cloud (ioredis) adapter with Upstash-REST-compatible semantics        */
/* -------------------------------------------------------------------------- */

/** Upstash auto-serializes non-string values; mirror that for ioredis. */
function serializeValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Upstash auto-parses JSON payloads; mirror that so reads keep their shape. */
function deserializeValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildSetArgs(opts?: JanaviSetOptions): string[] {
  const args: string[] = [];
  if (opts?.ex !== undefined) args.push("EX", String(opts.ex));
  if (opts?.px !== undefined) args.push("PX", String(opts.px));
  if (opts?.exat !== undefined) args.push("EXAT", String(opts.exat));
  if (opts?.pxat !== undefined) args.push("PXAT", String(opts.pxat));
  if (opts?.keepTtl) args.push("KEEPTTL");
  if (opts?.nx) args.push("NX");
  if (opts?.xx) args.push("XX");
  if (opts?.get) args.push("GET");
  return args;
}

/**
 * ioredis does not apply `keyPrefix` to keys passed to EVAL/EVALSHA, so the
 * adapter prefixes them manually to keep every key under the JANAVI prefix.
 */
function prefixScriptKeys(keys: string[]): string[] {
  const prefix = janaviRedisKeyPrefix();
  return keys.map((key) => `${prefix}${key}`);
}

/*
 * ioredis types SET/ZRANGE/ZADD as fixed overloads, which rejects a dynamic
 * spread of modifiers; these views describe how the adapter calls them (Redis
 * itself accepts any string arguments — numbers are stringified).
 */
type IoredisSetCommand = (
  key: string,
  value: string,
  ...args: string[]
) => Promise<string | null>;
type IoredisZRangeCommand = (
  key: string,
  min: number | string,
  max: number | string,
  ...args: string[]
) => Promise<string[]>;
type IoredisZAddCommand = (
  key: string,
  ...scoreMembers: (number | string)[]
) => Promise<number>;

function createJanaviRedisFacade(): JanaviRedisFacade {
  return {
    async get<TData>(key: string): Promise<TData | null> {
      const client = getJanaviRedis();
      if (!client) return null;
      return deserializeValue(await client.get(key)) as TData | null;
    },
    async getdel<TData>(key: string): Promise<TData | null> {
      const client = getJanaviRedis();
      if (!client) return null;
      return deserializeValue(await client.getdel(key)) as TData | null;
    },
    async set<TData>(
      key: string,
      value: TData,
      opts?: JanaviSetOptions,
    ): Promise<"OK" | TData | null> {
      const client = getJanaviRedis();
      if (!client) return "OK";
      return (await (client.set as unknown as IoredisSetCommand)(
        key,
        serializeValue(value),
        ...buildSetArgs(opts),
      )) as "OK" | TData | null;
    },
    async del(...keys: string[]): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.del(...keys);
    },
    async expire(key: string, seconds: number): Promise<0 | 1> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return (await client.expire(key, seconds)) as 0 | 1;
    },
    async setex<TData>(key: string, ttl: number, value: TData): Promise<"OK"> {
      const client = getJanaviRedis();
      if (!client) return "OK";
      return (await client.setex(key, ttl, serializeValue(value))) as "OK";
    },
    async incr(key: string): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.incr(key);
    },
    async sadd<TData>(
      key: string,
      member: TData,
      ...members: TData[]
    ): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.sadd(
        key,
        ...[member, ...members].map((m) => serializeValue(m)),
      );
    },
    async srem<TData>(key: string, ...members: TData[]): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.srem(key, ...members.map((m) => serializeValue(m)));
    },
    async smembers(key: string): Promise<string[]> {
      const client = getJanaviRedis();
      if (!client) return [];
      const members = await client.smembers(key);
      return members.map((m) => deserializeValue(m)) as string[];
    },
    async sismember<TData>(key: string, member: TData): Promise<0 | 1> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return (await client.sismember(key, serializeValue(member))) as 0 | 1;
    },
    async lrange(key: string, start: number, end: number): Promise<string[]> {
      const client = getJanaviRedis();
      if (!client) return [];
      const items = await client.lrange(key, start, end);
      return items.map((item) => deserializeValue(item)) as string[];
    },
    async zadd(
      key: string,
      ...scores: JanaviScoreMember[]
    ): Promise<number | null> {
      const client = getJanaviRedis();
      if (!client) return null;
      const args: (number | string)[] = [];
      for (const scoreMember of scores) {
        if (Array.isArray(scoreMember)) {
          args.push(scoreMember[0], serializeValue(scoreMember[1]));
        } else {
          args.push(scoreMember.score, serializeValue(scoreMember.member));
        }
      }
      return (client.zadd as unknown as IoredisZAddCommand)(key, ...args);
    },
    async zrange(
      key: string,
      min: number,
      max: number,
      opts?: JanaviZRangeOptions,
    ): Promise<string[]> {
      const client = getJanaviRedis();
      if (!client) return [];
      const args: string[] = [];
      if (opts?.byScore) args.push("BYSCORE");
      if (opts?.byLex) args.push("BYLEX");
      if (opts?.rev) args.push("REV");
      if (opts?.limit) {
        args.push("LIMIT", String(opts.limit.offset), String(opts.limit.count));
      }
      const members = await (client.zrange as unknown as IoredisZRangeCommand)(
        key,
        min,
        max,
        ...args,
      );
      return members.map((m) => deserializeValue(m)) as string[];
    },
    async zrem<TData>(key: string, ...members: TData[]): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.zrem(key, ...members.map((m) => serializeValue(m)));
    },
    async hset<TData>(key: string, kv: Record<string, TData>): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      const serialized: Record<string, string> = {};
      for (const [field, value] of Object.entries(kv)) {
        serialized[field] = serializeValue(value);
      }
      return client.hset(key, serialized);
    },
    async hincrby(
      key: string,
      field: string,
      increment: number,
    ): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return client.hincrby(key, field, increment);
    },
    async eval(
      script: string,
      keys: string[],
      args: string[],
    ): Promise<unknown> {
      const client = getJanaviRedis();
      if (!client) throw new Error("[redis] stub transport: eval unavailable");
      return client.eval(
        script,
        keys.length,
        ...prefixScriptKeys(keys),
        ...args,
      );
    },
    async evalsha(
      sha1: string,
      keys: string[],
      args: string[],
    ): Promise<unknown> {
      const client = getJanaviRedis();
      if (!client) {
        throw new Error("[redis] stub transport: evalsha unavailable");
      }
      return client.evalsha(
        sha1,
        keys.length,
        ...prefixScriptKeys(keys),
        ...args,
      );
    },
    async zincrby(
      key: string,
      increment: number,
      member: unknown,
    ): Promise<number> {
      const client = getJanaviRedis();
      if (!client) return 0;
      return Number(
        await client.zincrby(key, increment, serializeValue(member)),
      );
    },
    pipeline(): JanaviRedisPipeline {
      const client = getJanaviRedis();
      if (!client) {
        return {
          set: () => undefined,
          del: () => undefined,
          expire: () => undefined,
          sadd: () => undefined,
          rpush: () => undefined,
          exec: async () => [],
        };
      }
      const pipeline = client.pipeline();
      return {
        set: (key: string, value: unknown, opts?: JanaviSetOptions) => {
          (pipeline.set as unknown as IoredisSetCommand)(
            key,
            serializeValue(value),
            ...buildSetArgs(opts),
          );
        },
        del: (...keys: string[]) => {
          pipeline.del(...keys);
        },
        expire: (key: string, seconds: number) => {
          pipeline.expire(key, seconds);
        },
        sadd: (key: string, member: unknown, ...members: unknown[]) => {
          pipeline.sadd(key, ...[member, ...members].map(serializeValue));
        },
        rpush: (key: string, ...values: unknown[]) => {
          pipeline.rpush(key, ...values.map(serializeValue));
        },
        exec: async () => {
          const results = await pipeline.exec();
          if (!results) {
            return [];
          }
          // ioredis resolves each entry as [error, result]; Upstash surfaces
          // failures as rejections, so rethrow the first error for parity.
          return results.map(([error, result]) => {
            if (error) {
              throw error;
            }
            return result;
          });
        },
      };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Stub facade (no transport configured)                                       */
/* -------------------------------------------------------------------------- */

function createStubRedisFacade(): JanaviRedisFacade {
  const noop = () => undefined;
  return {
    get: async () => null,
    getdel: async () => null,
    set: async () => "OK",
    del: async () => 0,
    expire: async () => 0,
    setex: async () => "OK",
    incr: async () => 0,
    sadd: async () => 0,
    srem: async () => 0,
    smembers: async () => [],
    sismember: async () => 0,
    lrange: async () => [],
    zadd: async () => null,
    zrange: async () => [],
    zrem: async () => 0,
    hset: async () => 0,
    hincrby: async () => 0,
    // Throwing here (at call time, never at import time) lets ratelimit
    // wrappers catch the failure and fail open.
    eval: async () => {
      throw new Error("[redis] stub transport: eval unavailable");
    },
    evalsha: async () => {
      throw new Error("[redis] stub transport: evalsha unavailable");
    },
    zincrby: async () => 0,
    pipeline: () => ({
      set: noop,
      del: noop,
      expire: noop,
      sadd: noop,
      rpush: noop,
      exec: async () => [],
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Exports (names preserved: `redis`, `lockerRedisClient`, `ratelimit`)        */
/* -------------------------------------------------------------------------- */

// Redis Cloud mode reuses one ioredis singleton for both exports: the locker
// shares the JANAVI Redis Cloud instance and all its keys live under the
// "janavi:dev:" prefix (e.g. "janavi:dev:tus-lock-<id>"). Upstash mode keeps
// the original dedicated locker client.
//
// The exports keep the historical static type (`Redis` from @upstash/redis)
// so every existing consumer — including `new Ratelimit({ redis })`, whose
// option type requires the full class — compiles unchanged. In Redis Cloud
// mode the runtime object is the JANAVI adapter, which implements the
// Upstash method surface used by this app (see JanaviRedisFacade) plus the
// eval/evalsha/zincrby helpers @upstash/ratelimit needs. Not implemented by
// the adapter: `multi()` and commands no call site uses.
const janaviFacade =
  redisTransport === "janavi"
    ? (createJanaviRedisFacade() as unknown as Redis)
    : null;
const stubFacade =
  redisTransport === "stub"
    ? (createStubRedisFacade() as unknown as Redis)
    : null;

/**
 * Lazily-resolved underlying client. If the module initialized in stub mode
 * (env not yet loaded), re-resolve once on first access; if a real transport
 * is available then, upgrade to it permanently.
 */
function resolveUnderlying(preferLocker: boolean): Redis {
  if (!transportResolved) {
    transportResolved = true;
    const upgraded = resolveRedisTransport();
    if (upgraded === "janavi") {
      const facade = createJanaviRedisFacade() as unknown as Redis;
      // rebind memoized slots so ratelimit and future resolutions agree
      return facade;
    }
    if (upgraded === "upstash") {
      const { upstashMain, upstashLocker } = createUpstashClients();
      if (preferLocker) return upstashLocker;
      return upstashMain;
    }
  }
  return (
    janaviFacade ??
    (preferLocker ? upstashLockerRedis : upstashRedis) ??
    (stubFacade as Redis)
  );
}

const memo: { main?: Redis; locker?: Redis } = {};
function underlying(preferLocker: boolean): Redis {
  const slot = preferLocker ? "locker" : "main";
  if (!memo[slot]) memo[slot] = resolveUnderlying(preferLocker);
  return memo[slot];
}

/** Lazy facade: binds to the real transport on first property access. */
function lazyRedisFacade(preferLocker: boolean): Redis {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        const target = underlying(preferLocker) as unknown as Record<
          string | symbol,
          unknown
        >;
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    },
  ) as unknown as Redis;
}

export const redis: Redis = lazyRedisFacade(false);
export const lockerRedisClient: Redis = lazyRedisFacade(true);

type JanaviRatelimitReturn = JanaviRateLimiter;

// Create a new ratelimiter, that allows 10 requests per 10 seconds by default
export const ratelimit = (
  requests: number = 10,
  seconds: JanaviDurationString = "10 s",
): JanaviRatelimitReturn => {
  const effectiveTransport = transportResolved ? redisTransport : resolveRedisTransport();
  if (effectiveTransport === "janavi") {
    return createJanaviRateLimiter(requests, seconds);
  }
  if (effectiveTransport === "upstash") {
    return new Ratelimit({
      redis: upstashRedis as Redis,
      limiter: Ratelimit.slidingWindow(requests, seconds),
      analytics: true,
      prefix: "papermark",
    });
  }
  // Stub mode: fail open so a missing Redis never blocks requests.
  return {
    limit: async () => ({
      success: true,
      limit: requests,
      remaining: Math.max(0, requests - 1),
      reset: Date.now() + parseJanaviDurationMs("10 s"),
    }),
  };
};

/* -------------------------------------------------------------------------- */
/* Sliding-window rate limiter over standard Redis (Lua, atomic)               */
/* -------------------------------------------------------------------------- */

/**
 * Atomic sliding window: ZREMRANGEBYSCORE (drop expired) + ZADD (record this
 * request) + PEXPIRE (keep the key fresh) + window math.
 *
 * KEYS[1] = rate limit key (already prefixed by the caller — ioredis does NOT
 *           apply keyPrefix to keys passed to EVAL)
 * ARGV[1] = now (ms), ARGV[2] = window (ms), ARGV[3] = max requests,
 * ARGV[4] = unique member id
 * Returns { allowed (0/1), remaining, reset (unix ms) }
 */
const JANAVI_SLIDING_WINDOW_LUA = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1] - ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
local allowed = count < tonumber(ARGV[3])
if allowed then
  redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
local reset = tonumber(ARGV[1]) + tonumber(ARGV[2])
if oldest[2] then
  reset = math.floor(tonumber(oldest[2]) + tonumber(ARGV[2]))
end
local remaining = 0
if allowed then
  remaining = tonumber(ARGV[3]) - count - 1
end
return { allowed and 1 or 0, remaining, reset }
`;

function parseJanaviDurationMs(duration: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/i.exec(duration.trim());
  if (!match) {
    return 10_000;
  }
  const value = Number.parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case "ms":
      return value;
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      return 10_000;
  }
}

function createJanaviRateLimiter(
  requests: number,
  seconds: JanaviDurationString,
): JanaviRateLimiter {
  const windowMs = parseJanaviDurationMs(seconds);
  return {
    limit: async (identifier: string): Promise<JanaviRateLimitResult> => {
      const client = getJanaviRedis();
      const now = Date.now();
      // Fail open when the connection cannot be established.
      if (!client) {
        return {
          success: true,
          limit: requests,
          remaining: Math.max(0, requests - 1),
          reset: now + windowMs,
        };
      }
      // EVAL keys are NOT auto-prefixed by ioredis, so apply the
      // "janavi:dev:" prefix manually to keep every key namespaced.
      const key = `${janaviRedisKeyPrefix()}ratelimit:${identifier}`;
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        const result = (await client.eval(
          JANAVI_SLIDING_WINDOW_LUA,
          1,
          key,
          now,
          windowMs,
          requests,
          member,
        )) as [number, number, number];
        const [success, remaining, reset] = result;
        return {
          success: success === 1,
          limit: requests,
          remaining,
          reset,
        };
      } catch (error) {
        // Never let limiter failures block traffic; match the stub behavior.
        console.warn(
          `[redis] sliding-window limiter failed, failing open: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return {
          success: true,
          limit: requests,
          remaining: Math.max(0, requests - 1),
          reset: now + windowMs,
        };
      }
    },
  };
}

export { closeJanaviRedis };
