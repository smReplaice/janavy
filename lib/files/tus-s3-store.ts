import { S3 } from "@aws-sdk/client-s3";
import { S3Store, type Options as S3StoreOptions } from "@tus/s3-store";
import type { Upload } from "@tus/server";
import type { Readable } from "stream";

import {
  type StorageConfig,
  getStorageConfig,
} from "@/lib/files/storage-config";
import { getFeatureFlags } from "@/lib/featureFlags";

/**
 * JANAVI team-aware tus datastore.
 *
 * Independent replacement for the commercial `MultiRegionS3Store`
 * (`ee/features/storage/s3-store`), kept under the same exported name so
 * the tus routes continue to compile. Upload IDs carry the owning team as
 * their first path segment (`teamId/docId/filename`); the store routes each
 * upload to the team's storage region (primary, or the optional secondary
 * region when the team has the `usStorage` feature flag).
 *
 * Teams without the flag never touch the secondary region, so a deployment
 * that only configures the primary region works unchanged.
 */

const TEAM_FLAG_CACHE_TTL_MS = 5 * 60 * 1000;

interface RegionTarget {
  config: StorageConfig;
  client: S3;
}

function buildClient(config: StorageConfig): S3 {
  return new S3({
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export class MultiRegionS3Store extends S3Store {
  private primary: RegionTarget;
  private secondary: RegionTarget;
  private useSecondaryByTeam = new Map<string, boolean>();

  constructor() {
    const primaryConfig = getStorageConfig();
    const storeOptions: S3StoreOptions = {
      partSize: 8 * 1024 * 1024, // 8 MiB parts
      s3ClientConfig: {
        bucket: primaryConfig.bucket,
        region: primaryConfig.region,
        credentials: {
          accessKeyId: primaryConfig.accessKeyId,
          secretAccessKey: primaryConfig.secretAccessKey,
        },
        ...(primaryConfig.endpoint
          ? { endpoint: primaryConfig.endpoint }
          : {}),
      },
    };
    super(storeOptions);

    this.primary = {
      config: primaryConfig,
      client: buildClient(primaryConfig),
    };

    // The secondary region is optional: fall back to primary when its
    // environment variables are not configured.
    try {
      const secondaryConfig = getStorageConfig("us-east-2");
      this.secondary = {
        config: secondaryConfig,
        client: buildClient(secondaryConfig),
      };
    } catch {
      this.secondary = this.primary;
    }
  }

  /** Upload IDs are `teamId/docId/filename`; the first segment is the team. */
  private extractTeamIdFromUploadId(uploadId: string): string | null {
    const teamId = uploadId.split("/")[0];
    return teamId.length > 0 ? teamId : null;
  }

  private async shouldUseSecondaryRegion(teamId: string): Promise<boolean> {
    const cached = this.useSecondaryByTeam.get(teamId);
    if (cached !== undefined) {
      return cached;
    }

    let useSecondary = false;
    try {
      const features = await getFeatureFlags({ teamId });
      useSecondary = features.usStorage || false;
    } catch {
      useSecondary = false;
    }

    this.useSecondaryByTeam.set(teamId, useSecondary);
    setTimeout(
      () => this.useSecondaryByTeam.delete(teamId),
      TEAM_FLAG_CACHE_TTL_MS,
    );

    return useSecondary;
  }

  private async applyRegionForUpload(uploadId: string): Promise<void> {
    const teamId = this.extractTeamIdFromUploadId(uploadId);
    if (!teamId) {
      this.client = this.primary.client;
      this.bucket = this.primary.config.bucket;
      return;
    }

    const target =
      (await this.shouldUseSecondaryRegion(teamId))
        ? this.secondary
        : this.primary;
    this.client = target.client;
    this.bucket = target.config.bucket;
  }

  async create(upload: Upload): Promise<Upload> {
    await this.applyRegionForUpload(upload.id);
    return super.create(upload);
  }

  async write(stream: Readable, id: string, offset: number): Promise<number> {
    await this.applyRegionForUpload(id);
    return super.write(stream, id, offset);
  }

  async getUpload(id: string): Promise<Upload> {
    await this.applyRegionForUpload(id);
    return super.getUpload(id);
  }

  async remove(id: string): Promise<void> {
    await this.applyRegionForUpload(id);
    const teamId = this.extractTeamIdFromUploadId(id);
    if (teamId) {
      this.useSecondaryByTeam.delete(teamId);
    }
    await super.remove(id);
  }

  async declareUploadLength(id: string, length: number): Promise<void> {
    await this.applyRegionForUpload(id);
    await super.declareUploadLength(id, length);
  }

  async read(id: string): Promise<Readable> {
    await this.applyRegionForUpload(id);
    return super.read(id);
  }
}
