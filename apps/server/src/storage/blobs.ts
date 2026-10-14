import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { blobs } from "../db/schema.ts";
import { HttpError } from "../errors.ts";
import type { Logger } from "../log.ts";

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/// Whether the server has object storage: an endpoint (MinIO, any S3 API) or keys
/// (AWS S3, where the endpoint follows from the region).
export function storageConfigured(config: Config): boolean {
  return Boolean(config.S3_ENDPOINT || config.S3_ACCESS_KEY_ID);
}

export interface StoredBlob {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string;
}

/// File contents in S3, through the AWS SDK only, so MinIO and AWS S3 are one
/// setting apart. Objects are keyed `blobs/<owner>/<sha256>`: content addressed, so
/// an upload is idempotent and a retry is always safe. The server hashes every
/// upload as it streams in and refuses one that doesn't match its name, and S3
/// checks the same SHA-256 again when it stores the object.
export class BlobStore {
  readonly client: S3Client;
  private readonly db: Database;
  private readonly config: Config;
  private readonly log: Logger;

  constructor(db: Database, config: Config, log: Logger) {
    this.db = db;
    this.config = config;
    this.log = log;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  private key(owner: string, sha256: string) {
    return `blobs/${owner}/${sha256}`;
  }

  /// Makes the bucket with versioning, so an overwritten or deleted object can be
  /// recovered. Retries while the storage starts up.
  async ensureBucket(attempts = 30): Promise<void> {
    const Bucket = this.config.S3_BUCKET;
    for (let attempt = 1; ; attempt++) {
      try {
        const exists = await this.client
          .send(new HeadBucketCommand({ Bucket }))
          .then(() => true)
          .catch((error: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
            if (error.$metadata?.httpStatusCode === 404 || error.name === "NotFound") return false;
            throw error;
          });
        if (!exists) await this.client.send(new CreateBucketCommand({ Bucket }));
        await this.client.send(
          new PutBucketVersioningCommand({
            Bucket,
            VersioningConfiguration: { Status: "Enabled" },
          }),
        );
        return;
      } catch (error) {
        if (attempt >= attempts) throw error;
        this.log.warn("object storage not ready yet", { attempt });
        await Bun.sleep(1000);
      }
    }
  }

  async exists(owner: string, sha256: string): Promise<boolean> {
    const [row] = await this.db
      .select({ sha256: blobs.sha256 })
      .from(blobs)
      .where(and(eq(blobs.ownerId, owner), eq(blobs.sha256, sha256)));
    return row !== undefined;
  }

  /// Stores an upload. The body goes to a temporary file while it is hashed, so a
  /// large file never sits in memory; only a body whose hash matches reaches S3,
  /// and the row that says it exists is written after S3 confirmed it.
  async put(
    owner: string,
    sha256: string,
    body: ReadableStream<Uint8Array>,
    contentType: string,
  ): Promise<"created" | "existing"> {
    if (await this.exists(owner, sha256)) {
      await body.cancel().catch(() => {});
      return "existing";
    }
    const dir = await mkdtemp(join(tmpdir(), "nookly-upload-"));
    const path = join(dir, sha256);
    try {
      const hasher = new Bun.CryptoHasher("sha256");
      const writer = Bun.file(path).writer();
      let size = 0;
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > this.config.MAX_BLOB_BYTES) {
          throw new HttpError(413, "too_large", "This file is larger than the server allows.");
        }
        hasher.update(chunk);
        writer.write(chunk);
      }
      await writer.end();
      const digest = hasher.digest();
      if (digest.toString("hex") !== sha256) {
        throw new HttpError(
          422,
          "checksum_mismatch",
          "The file changed on the way. It will be sent again.",
        );
      }
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: this.key(owner, sha256),
          Body: createReadStream(path),
          ContentLength: size,
          ContentType: contentType,
          ChecksumSHA256: digest.toString("base64"),
        }),
      );
      await this.db
        .insert(blobs)
        .values({ ownerId: owner, sha256, size, contentType })
        .onConflictDoNothing();
      return "created";
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async get(owner: string, sha256: string): Promise<StoredBlob | null> {
    const [row] = await this.db
      .select()
      .from(blobs)
      .where(and(eq(blobs.ownerId, owner), eq(blobs.sha256, sha256)));
    if (!row) return null;
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: this.key(owner, sha256) }),
    );
    if (!object.Body) return null;
    return {
      body: object.Body.transformToWebStream(),
      size: row.size,
      contentType: row.contentType,
    };
  }

  /// Removes every version of every object an account stored, for deleting the
  /// account. Its rows go with the account.
  async deleteOwner(owner: string): Promise<void> {
    const Bucket = this.config.S3_BUCKET;
    const Prefix = `blobs/${owner}/`;
    for (;;) {
      const listed = await this.client.send(new ListObjectVersionsCommand({ Bucket, Prefix }));
      const objects = [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]
        .filter((v) => v.Key)
        .map((v) => ({ Key: v.Key, VersionId: v.VersionId }));
      if (objects.length === 0) return;
      await this.client.send(
        new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects, Quiet: true } }),
      );
    }
  }
}
