import { redis } from "/Users/replaice/apps/papermark/lib/redis.ts";
await redis.set("facade-probe", "hello", { ex: 60 });
const got = await redis.get("facade-probe");
console.log("facade get:", got);
const raw = await (await import("ioredis")).default.prototype && null;
await redis.del("facade-probe");
console.log("done");
process.exit(0);
