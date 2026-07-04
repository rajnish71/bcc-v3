// backend/src/modules/shared/storage/r2.service.ts
//
// Cloudflare R2 access via the S3-compatible API (TECH-STACK-FREEZE:
// R2 + ImageKit is the frozen storage decision).
//
// Upload strategy is PRESIGNED PUT, deliberately: files travel
// browser -> R2 directly and never stream through this 1.9GB box. The
// backend only signs URLs and HEADs objects to confirm uploads landed.
//
// Configuration comes from .env (R2_ENDPOINT, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). The client initialises LAZILY and
// throws a clear 503 if config is missing -- the rest of Module 02 batch 3
// (group CRUD, clarifications, approval stages) works without R2 being
// configured yet; only document upload endpoints hard-require it.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGN_TTL_SECONDS = 15 * 60;

@Injectable()
export class R2Service {
  private client: S3Client | null = null;
  private bucket = '';

  private ensureClient(): S3Client {
    if (this.client) return this.client;

    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET_NAME;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new ServiceUnavailableException(
        'R2 storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in backend/.env (values must be quoted if they contain special characters).',
      );
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }

  // Presigned PUT: the signature covers Content-Type and Content-Length, so
  // the browser MUST send exactly the declared type and size or R2 rejects
  // the upload -- server-side enforcement without server-side streaming.
  async presignUpload(objectKey: string, contentType: string, contentLength: number): Promise<string> {
    const client = this.ensureClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(client, command, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  // HEAD after client-side upload: confirms the object actually exists and
  // returns its true size as stored.
  async headObject(objectKey: string): Promise<{ exists: boolean; sizeBytes: number | null }> {
    const client = this.ensureClient();
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return { exists: true, sizeBytes: res.ContentLength ?? null };
    } catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return { exists: false, sizeBytes: null };
      throw err;
    }
  }
}
