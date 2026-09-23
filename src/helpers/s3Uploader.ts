import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import config from '../config';

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heic-sequence': '.heic',
  'image/heif': '.heif',
  'image/heif-sequence': '.heif',
  'image/tiff': '.tiff',
  'image/tif': '.tif',
  'image/x-tiff': '.tiff',
  'image/bmp': '.bmp',
  'image/x-ms-bmp': '.bmp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'video/mp4': '.mp4',
  'audio/mpeg': '.mp3',
};

const mimeTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

const s3 = new S3Client({
  region: config.storage.s3.region,
  maxAttempts: 3,
});

const getPublicUrl = (key: string) => {
  const domain = config.storage.cloudfrontDomain;
  if (domain) {
    return `${domain}/${key}`;
  }
  const bucket = config.storage.s3.bucket;
  const region = config.storage.s3.region;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const uploadBufferToS3 = async (
  buffer: Buffer,
  originalFileName: string,
  mimetype: string,
  keyPrefix = 'chat-attachments',
) => {
  if (!originalFileName.trim()) {
    throw new Error('S3 object file name is required');
  }
  const normalizedMime = (mimetype || '').toLowerCase();
  let ext = extensionByMimeType[normalizedMime];
  let effectiveContentType = mimetype || 'application/octet-stream';

  if (!ext) {
    const match = originalFileName.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      const fileExt = `.${match[1].toLowerCase()}`;
      if (mimeTypeByExtension[fileExt]) {
        ext = fileExt;
        effectiveContentType = mimeTypeByExtension[fileExt];
      }
    }
  }

  if (!ext) {
    throw new Error('S3 object content type is not supported');
  }
  const safePrefix = keyPrefix
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/^\/+/, '');
  if (!safePrefix || safePrefix.includes('..')) {
    throw new Error('S3 object prefix is invalid');
  }
  const key = `${safePrefix}/${Date.now()}-${randomUUID()}${ext}`;

  const bucket = config.storage.s3.bucket;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: effectiveContentType,
    ServerSideEncryption: 'AES256',
    CacheControl: 'private, max-age=31536000, immutable',
  });
  await s3.send(command);
  return { key, url: getPublicUrl(key) };
};

const getSignedDownloadUrl = async (key: string) => {
  const objectKey = key.trim().replace(/^\/+/, '');
  if (!objectKey || objectKey.includes('\0')) {
    throw new Error('S3 object key is invalid');
  }

  const command = new GetObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: objectKey,
  });

  return getSignedUrl(s3, command, {
    expiresIn: config.storage.s3.presignedUrlExpiresIn,
  });
};

export const s3Uploader = {
  uploadBufferToS3,
  getSignedDownloadUrl,
  async deleteByKey(key: string) {
    const bucket = config.storage.s3.bucket;
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await s3.send(command);
  },
};
