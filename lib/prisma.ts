import { PrismaClient } from "@prisma/client";

import { applyJanaviDatabaseEnv } from "@/lib/janavi/db-env";

// NOTE (agreements, 2026-10-20): after `prisma migrate dev` regenerates the
// client, an already-running dev server can hold the previous PrismaClient in
// its module cache (unknown-argument errors on new columns). Editing this file
// invalidates the module so the next request constructs a fresh client.

// Compose POSTGRES_PRISMA_URL(_NON_POOLING) from the JANAVI DB_* variables
// before the client is constructed — PrismaClient resolves env() URLs at
// construction time, so setting process.env first works at runtime.
applyJanaviDatabaseEnv();

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;

// signature subsystem (2026-10-20): reload marker after add_native_signing regenerate
