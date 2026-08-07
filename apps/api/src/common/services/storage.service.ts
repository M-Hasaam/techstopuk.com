import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  DeleteObjectsCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const FOLDERS = [
  'device-images',
  'trade-in-images',
  'repair-images',
  'review-images',
  'banners',
  'banners/promo',
  'banners/grade',
] as const;

// These paths contain user-submitted content and must stay private.
// Everything else (catalog, banners, device-images, reviews) is public.
const PRIVATE_PREFIXES = ['trade-in-images/', 'repair-images/'];

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private publicClient: S3Client;
  private readonly bucketName = process.env.GARAGE_BUCKET || 'ai-ecommerce';
  private readonly publicBase: string;

  constructor() {
    const credentials = {
      accessKeyId: process.env.GARAGE_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.GARAGE_SECRET_KEY || 'minioadmin',
    };

    // Internal client — used for server-to-server operations (upload, delete, policy)
    this.s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.GARAGE_ENDPOINT || 'http://localhost:9000',
      credentials,
      forcePathStyle: true,
    });

    // Public client — used only for presigned PUT/GET URLs that browsers will call.
    // Must resolve to an address the browser can reach (not an internal Docker hostname).
    const publicEndpoint =
      process.env.GARAGE_PUBLIC_URL ||
      process.env.GARAGE_ENDPOINT ||
      'http://localhost:9000';

    this.publicClient = new S3Client({
      region: 'us-east-1',
      endpoint: publicEndpoint,
      credentials,
      forcePathStyle: true,
    });

    this.publicBase = publicEndpoint.replace(/\/$/, '');
  }

  async onModuleInit() {
    await this.ensureBucketAndFolders();
  }

  private async ensureBucketAndFolders() {
    // 1. Create bucket if missing
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      this.logger.log(`Bucket "${this.bucketName}" already exists`);
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        this.logger.log(`Bucket "${this.bucketName}" created`);
      } catch (err: any) {
        if (err?.Code !== 'BucketAlreadyOwnedByYou') {
          this.logger.error(`Failed to create bucket: ${err?.message}`);
        }
      }
    }

    // 2. CORS — browsers need this for direct PUT (upload) and GET (image display)
    try {
      const origins = (
        process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001'
      )
        .split(',')
        .map((s) => s.trim());

      await this.s3Client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: origins,
                AllowedMethods: ['PUT', 'GET', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 86400,
              },
            ],
          },
        }),
      );
      this.logger.log('Bucket CORS configured');
    } catch (err: any) {
      this.logger.warn(`CORS setup skipped: ${err?.message}`);
    }

    // 3. Public-read policy for catalog/banner paths — private paths excluded.
    //    This lets browsers load product images as plain cacheable URLs with no
    //    signature overhead. trade-in-images/ and repair-images/ stay private.
    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadCatalogAndMedia',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: [
              `arn:aws:s3:::${this.bucketName}/catalog/*`,
              `arn:aws:s3:::${this.bucketName}/products/*`,
              `arn:aws:s3:::${this.bucketName}/banners/*`,
              `arn:aws:s3:::${this.bucketName}/device-images/*`,
              `arn:aws:s3:::${this.bucketName}/review-images/*`,
              `arn:aws:s3:::${this.bucketName}/brand-images/*`,
            ],
          },
        ],
      };

      await this.s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucketName,
          Policy: JSON.stringify(policy),
        }),
      );
      this.logger.log('Bucket public-read policy applied for catalog paths');
    } catch (err: any) {
      this.logger.warn(
        `Bucket policy skipped (set manually in MinIO console if needed): ${err?.message}`,
      );
    }

    // 4. Seed .keep placeholders so folders are visible in the MinIO console
    for (const folder of FOLDERS) {
      try {
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: `${folder}/.keep`,
            Body: '',
            ContentType: 'application/octet-stream',
          }),
        );
        this.logger.log(`Folder ready: ${folder}/`);
      } catch (err: any) {
        this.logger.warn(`Could not seed folder "${folder}": ${err?.message}`);
      }
    }
  }

  // ─── Key helpers ─────────────────────────────────────────────────────────────

  /** Strips path separators/traversal/control chars from a caller-supplied key
   *  segment (groupId, filename) — both are interpolated directly into the S3
   *  key, so an unsanitized value could escape the intended folder prefix. */
  private sanitizeKeyPart(value: string): string {
    return value.replace(/[/\\]/g, '').replace(/\.\./g, '').replace(/[\x00-\x1f]/g, '');
  }

  buildKey(folder: string, filename: string, groupId?: string): string {
    const safeFilename = this.sanitizeKeyPart(filename);
    const safeGroupId = groupId ? this.sanitizeKeyPart(groupId) : undefined;
    const prefix = safeGroupId ? `${folder}/${safeGroupId}` : folder;
    return `${prefix}/${uuidv4()}-${safeFilename}`;
  }

  private isPrivate(key: string): boolean {
    return PRIVATE_PREFIXES.some((p) => key.startsWith(p));
  }

  // Plain permanent URL — only valid for public bucket paths.
  buildPublicUrl(key: string): string {
    return `${this.publicBase}/${this.bucketName}/${key}`;
  }

  // ─── URL resolution ──────────────────────────────────────────────────────────

  /**
   * Returns the right URL for a browser to load an image:
   * - Public paths  → plain permanent URL (fast, browser-cacheable, no expiry)
   * - Private paths → 7-day presigned GET URL
   * - External URLs → returned unchanged
   * - null/empty    → null
   */
  async resolveImageUrl(filePathOrUrl: string | null | undefined): Promise<string | null> {
    if (!filePathOrUrl) return null;

    // App-relative static path (e.g. a web app /public asset used as a seed default) — pass through unchanged
    if (filePathOrUrl.startsWith('/')) return filePathOrUrl;

    // External URL (e.g. scraped image, Unsplash) — pass through unchanged
    if (filePathOrUrl.startsWith('http')) {
      const isOwnStorage = filePathOrUrl.startsWith(this.publicBase);
      if (!isOwnStorage) return filePathOrUrl;

      // Extract the S3 key from a full URL stored in the DB
      const key = (new URL(filePathOrUrl).pathname
        .replace(`/${this.bucketName}/`, '')
        .split('?')[0]) ?? '';

      return this.isPrivate(key)
        ? this.presignGet(key)
        : this.buildPublicUrl(key);
    }

    // Raw S3 key stored in DB (the normal case)
    return this.isPrivate(filePathOrUrl)
      ? this.presignGet(filePathOrUrl)
      : this.buildPublicUrl(filePathOrUrl);
  }

  // ─── Presigned URLs ───────────────────────────────────────────────────────────

  async presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucketName, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  private async presignGet(key: string, expiresIn = 7 * 24 * 60 * 60): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      { expiresIn },
    );
  }

  // Legacy method — kept for backward compatibility with callers that use it directly
  async generatePresignedUrl(filePathOrUrl: string): Promise<string> {
    let key = filePathOrUrl;
    if (filePathOrUrl.startsWith('http')) {
      key = (new URL(filePathOrUrl).pathname
        .replace(`/${this.bucketName}/`, '')
        .split('?')[0]) ?? '';
    }
    return this.presignGet(key);
  }

  // ─── Server-side upload ───────────────────────────────────────────────────────

  async uploadFile(
    file: any,
    folder: string,
    groupId?: string,
  ): Promise<{ filePath: string; url: string }> {
    const safeFilename = this.sanitizeKeyPart(file.originalname);
    const safeGroupId = groupId ? this.sanitizeKeyPart(groupId) : undefined;
    const prefix = safeGroupId ? `${folder}/${safeGroupId}` : folder;
    const key = `${prefix}/${uuidv4()}-${safeFilename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = (await this.resolveImageUrl(key)) ?? '';
    return { filePath: key, url };
  }

  // ─── Download ─────────────────────────────────────────────────────────────────

  /** Accepts either a raw S3 key or a full own-storage URL and returns the key. */
  extractKey(imageRef: string): string {
    if (!imageRef.startsWith('http')) return imageRef;
    const pathname = new URL(imageRef).pathname;
    return pathname.replace(`/${this.bucketName}/`, '').split('?')[0] ?? imageRef;
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    );
    const stream = response.Body as NodeJS.ReadableStream;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  // ─── Deletion ─────────────────────────────────────────────────────────────────

  async deleteFiles(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += 1000) chunks.push(keys.slice(i, i + 1000));
    for (const chunk of chunks) {
      try {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: { Objects: chunk.map((k) => ({ Key: k })), Quiet: true },
          }),
        );
      } catch (err: any) {
        this.logger.warn(`S3 bulk delete partial failure: ${err?.message}`);
      }
    }
  }
}
