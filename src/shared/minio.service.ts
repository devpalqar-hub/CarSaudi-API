import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'villasqatar');

    this.client = new Minio.Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000')),
      useSSL:
        this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>(
        'MINIO_ACCESS_KEY',
        'minioadmin',
      ),
      secretKey: this.configService.get<string>(
        'MINIO_SECRET_KEY',
        'minioadmin',
      ),
    });

    await this.ensureBucketExists();
  }

  private async ensureBucketExists() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO bucket "${this.bucket}" created.`);
      } else {
        this.logger.log(`MinIO bucket "${this.bucket}" already exists.`);
      }

      // Ensure the bucket has a public read policy for open access
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      };
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
    } catch (err) {
      this.logger.error('Failed to initialize MinIO bucket', err?.message);
    }
  }

  /**
   * Upload a file buffer to MinIO.
   * Returns the MinIO object key.
   */
  async uploadFile(
    buffer: Buffer,
    objectKey: string,
    mimeType: string,
    size: number,
  ): Promise<string> {
    await this.client.putObject(this.bucket, objectKey, buffer, size, {
      'Content-Type': mimeType,
    });
    return objectKey;
  }

  /**
   * Generate a pre-signed URL for temporary download access.
   * Default expiry: 1 hour.
   */
  async getPresignedUrl(
    objectKey: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(
      this.bucket,
      objectKey,
      expirySeconds,
    );
  }

  /**
   * Delete an object from MinIO.
   */
  async deleteFile(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  /**
   * Download an object's full contents into memory.
   * Used for server-side re-serving of private files (e.g. invoice PDFs) behind an
   * authenticated/permission-checked endpoint, instead of exposing the bucket's public URL.
   */
  async getFileBuffer(objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Generate a direct (open) URL for an object.
   * Assumes the bucket has a public read policy.
   */
  getDirectUrl(objectKey: string): string {
    const useSSL =
      this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const endPoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );
    const portString = this.configService.get<string>('MINIO_PORT', '9000');

    // Only append port if it's not standard HTTP/HTTPS port
    const port =
      portString && portString !== '80' && portString !== '443'
        ? `:${portString}`
        : '';

    return `${protocol}://${endPoint}${port}/${this.bucket}/${objectKey}`;
  }
}
