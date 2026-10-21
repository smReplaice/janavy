import { getFeatureFlags } from "@/lib/featureFlags";

/**
 * JANAVI storage configuration (self-hosted).
 *
 * Independent replacement for the commercial `ee/features/storage/config`
 * with the same exported names/shapes the AGPL importers rely on
 * (`StorageConfig`, `getStorageConfig`, `getTeamStorageConfigById`) and the
 * same environment variable names, so existing deployments keep working:
 *
 *   NEXT_PRIVATE_UPLOAD_BUCKET(_US)                  primary upload bucket
 *   NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID(_US)
 *   NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY(_US)
 *   NEXT_PRIVATE_UPLOAD_REGION(_US)
 *   NEXT_PRIVATE_UPLOAD_ENDPOINT(_US)                optional S3-compatible endpoint
 *   NEXT_PRIVATE_ARCHIVE_BUCKET(_US)                 bulk-download archive bucket
 *   NEXT_PRIVATE_ADVANCED_UPLOAD_BUCKET(_US)         optional advanced bucket
 *   NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST(_US)
 *   NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST(_US)
 *   NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_ID(_US)
 *   NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_CONTENTS(_US)
 *   NEXT_PRIVATE_LAMBDA_FUNCTION_NAME(_US)
 *
 * JANAVI simplification: one primary region plus an optional secondary
 * region selected per team via the `usStorage` feature flag (same flag the
 * API surface already accepted as a `storageRegion` argument).
 */

export interface StorageConfig {
  bucket: string;
  advancedBucket?: string;
  /**
   * Bulk-download archive bucket. Optional: JANAVI has no consumer for it
   * today, so a deployment without `NEXT_PRIVATE_ARCHIVE_BUCKET(_US)` must
   * still boot and serve uploads (same lazy-optional rule as the advanced
   * bucket above).
   */
  archiveBucket?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  distributionHost?: string;
  advancedDistributionHost?: string;
  distributionKeyId?: string;
  distributionKeyContents?: string;
  lambdaFunctionName?: string;
}

export type StorageRegion = "eu-central-1" | "us-east-2";

const DEFAULT_REGIONS: Record<string, string> = {
  "eu-central-1": "eu-central-1",
  "us-east-2": "us-east-2",
};

/**
 * Gets storage configuration based on the storage region.
 * Uses environment variables with `_US` suffix for the secondary region,
 * no suffix for the primary region.
 *
 * @param storageRegion - Optional region key; `"us-east-2"` selects the
 *   `_US` variables, anything else selects the primary set.
 * @returns StorageConfig object with all necessary AWS configuration
 */
export function getStorageConfig(storageRegion?: string): StorageConfig {
  const isUS = storageRegion === "us-east-2";
  const suffix = isUS ? "_US" : "";

  const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
  };

  const regionVar = `NEXT_PRIVATE_UPLOAD_REGION${suffix}`;
  const region =
    process.env[regionVar] ||
    DEFAULT_REGIONS[storageRegion ?? "eu-central-1"] ||
    "eu-central-1";

  return {
    bucket: requireEnv(`NEXT_PRIVATE_UPLOAD_BUCKET${suffix}`),
    advancedBucket: process.env[`NEXT_PRIVATE_ADVANCED_UPLOAD_BUCKET${suffix}`],
    archiveBucket: process.env[`NEXT_PRIVATE_ARCHIVE_BUCKET${suffix}`],
    region,
    accessKeyId: requireEnv(`NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID${suffix}`),
    secretAccessKey: requireEnv(
      `NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY${suffix}`,
    ),
    endpoint: process.env[`NEXT_PRIVATE_UPLOAD_ENDPOINT${suffix}`],
    distributionHost:
      process.env[`NEXT_PRIVATE_UPLOAD_DISTRIBUTION_HOST${suffix}`],
    advancedDistributionHost:
      process.env[`NEXT_PRIVATE_ADVANCED_UPLOAD_DISTRIBUTION_HOST${suffix}`],
    distributionKeyId:
      process.env[`NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_ID${suffix}`],
    distributionKeyContents:
      process.env[`NEXT_PRIVATE_UPLOAD_DISTRIBUTION_KEY_CONTENTS${suffix}`],
    lambdaFunctionName:
      process.env[`NEXT_PRIVATE_LAMBDA_FUNCTION_NAME${suffix}`],
  };
}

/**
 * Gets storage configuration for a team. JANAVI keeps the team-aware
 * signature: a team with the `usStorage` feature flag is stored in the
 * secondary region, everyone else in the primary region.
 *
 * @param teamId - The team ID to get storage configuration for
 * @returns Promise<StorageConfig>
 */
export async function getTeamStorageConfigById(
  teamId: string,
): Promise<StorageConfig> {
  try {
    const features = await getFeatureFlags({ teamId });
    const storageRegion = features.usStorage ? "us-east-2" : undefined;
    return getStorageConfig(storageRegion);
  } catch (error) {
    console.warn(
      "Failed to resolve storage region for team %s:",
      teamId,
      error,
    );
    return getStorageConfig();
  }
}
