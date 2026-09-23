import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../errors/ApiError';

const storage = multer.memoryStorage();

export const imageMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
  'image/tif',
  'image/tiff',
  'image/x-tiff',
  'image/bmp',
  'image/x-ms-bmp',
  'image/avif',
  'image/gif',
]);

export const ocrImageMimeTypes = imageMimeTypes;

export const ocrImageExtension =
  /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;

const isAllowedImage = (file: Express.Multer.File) => {
  const normalizedMimeType = (file.mimetype || '').toLowerCase();
  const hasKnownMimeType = imageMimeTypes.has(normalizedMimeType);
  const hasKnownFallbackExtension =
    (normalizedMimeType === 'application/octet-stream' ||
      !normalizedMimeType ||
      normalizedMimeType === 'image/*') &&
    ocrImageExtension.test(file.originalname);

  return hasKnownMimeType || hasKnownFallbackExtension;
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedImage(file)) {
      cb(null, true);
    } else {
      cb(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          'Supported image formats are JPEG, PNG, WebP, HEIC/HEIF, TIFF, GIF, BMP, and AVIF',
        ),
      );
    }
  },
});

const ocrUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedImage(file)) {
      cb(null, true);
    } else {
      cb(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          'Supported image formats are JPEG, PNG, WebP, HEIC/HEIF, TIFF, GIF, BMP, and AVIF',
        ),
      );
    }
  },
});

const chatUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      (file.mimetype === 'application/octet-stream' &&
        /\.pdf$/i.test(file.originalname));

    if (isAllowedImage(file) || isPdf) {
      cb(null, true);
    } else {
      cb(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          'Only supported image files and PDF documents are allowed',
        ),
      );
    }
  },
});

export { chatUpload, ocrUpload, upload };
