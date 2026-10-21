import { tenant } from "@teamhanko/passkeys-next-auth-provider";

/**
 * Hanko passkey tenant client.
 *
 * Constructed lazily so that a missing configuration does not crash module
 * evaluation at build time (page-data collection imports every route). The
 * passkey provider in lib/auth/auth-options.ts only requests the tenant when
 * passkey sign-in is actually used, so an unconfigured deployment simply has
 * passkey login unavailable instead of a broken build.
 */

let hankoTenant: ReturnType<typeof tenant> | null = null;

export function isHankoConfigured(): boolean {
  return Boolean(
    process.env.HANKO_API_KEY && process.env.NEXT_PUBLIC_HANKO_TENANT_ID,
  );
}

export function getHankoTenant(): ReturnType<typeof tenant> {
  if (hankoTenant) {
    return hankoTenant;
  }

  if (!isHankoConfigured()) {
    throw new Error(
      "Passkey sign-in is not configured. Set HANKO_API_KEY and NEXT_PUBLIC_HANKO_TENANT_ID to enable it.",
    );
  }

  hankoTenant = tenant({
    apiKey: process.env.HANKO_API_KEY!,
    tenantId: process.env.NEXT_PUBLIC_HANKO_TENANT_ID!,
  });
  return hankoTenant;
}
