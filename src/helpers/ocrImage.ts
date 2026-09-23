/* eslint-disable no-undef */
import { StatusCodes } from 'http-status-codes';
import convertHeic from 'heic-convert';
import sharp from 'sharp';
import ApiError from '../errors/ApiError';

const MAX_OCR_INPUT_PIXELS = 50_000_000;
const MAX_OCR_OUTPUT_DIMENSION = 4096;

const HEIF_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

const invalidImageError = (message = 'Unsupported or invalid image file') =>
  new ApiError(StatusCodes.BAD_REQUEST, message);

const exceedsPixelLimit = (width: number, height: number) =>
  width <= 0 || height <= 0 || width > MAX_OCR_INPUT_PIXELS / height;

const assertHeifPixelLimit = (input: Buffer) => {
  let searchOffset = 0;
  let foundDimensions = false;

  while (searchOffset < input.length) {
    const typeOffset = input.indexOf('ispe', searchOffset, 'ascii');
    if (typeOffset === -1) break;
    searchOffset = typeOffset + 4;

    // ispe is a FullBox: size + type + version/flags + width + height.
    if (typeOffset < 4 || typeOffset + 16 > input.length) continue;

    const boxSize = input.readUInt32BE(typeOffset - 4);
    if (boxSize < 20 || typeOffset - 4 + boxSize > input.length) continue;

    const width = input.readUInt32BE(typeOffset + 8);
    const height = input.readUInt32BE(typeOffset + 12);
    foundDimensions = true;

    if (exceedsPixelLimit(width, height)) {
      throw invalidImageError(
        `Image exceeds the ${MAX_OCR_INPUT_PIXELS / 1_000_000} megapixel OCR limit`,
      );
    }
  }

  if (!foundDimensions) {
    throw invalidImageError('Unable to verify HEIC/HEIF image dimensions');
  }
};

const hasHeifSignature = (input: Buffer) => {
  if (input.length < 12 || input.toString('ascii', 4, 8) !== 'ftyp') {
    return false;
  }

  const declaredSize = input.readUInt32BE(0);
  const boxEnd = Math.min(
    input.length,
    declaredSize >= 12 ? declaredSize : input.length,
  );

  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    if (HEIF_BRANDS.has(input.toString('ascii', offset, offset + 4))) {
      return true;
    }
  }

  return false;
};

const isHeifInput = (input: Buffer, mimeType?: string) =>
  (mimeType !== undefined && HEIF_MIME_TYPES.has(mimeType.toLowerCase())) ||
  hasHeifSignature(input);

const normalizeWithSharp = (input: Buffer) =>
  sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_OCR_INPUT_PIXELS,
    pages: 1,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: MAX_OCR_OUTPUT_DIMENSION,
      height: MAX_OCR_OUTPUT_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

const isSharpPixelLimitError = (error: unknown) =>
  error instanceof Error && /pixel limit/i.test(error.message);

export const normalizeImageForOCR = async (
  input: Buffer,
  mimeType?: string,
) => {
  if (input.length === 0) {
    throw invalidImageError();
  }

  try {
    return await normalizeWithSharp(input);
  } catch (error) {
    if (isSharpPixelLimitError(error)) {
      throw invalidImageError(
        `Image exceeds the ${MAX_OCR_INPUT_PIXELS / 1_000_000} megapixel OCR limit`,
      );
    }

    if (!isHeifInput(input, mimeType)) {
      throw invalidImageError();
    }
  }

  try {
    assertHeifPixelLimit(input);
    const converted = await convertHeic({ buffer: input, format: 'PNG' });
    return await normalizeWithSharp(Buffer.from(converted));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isSharpPixelLimitError(error)) {
      throw invalidImageError(
        `Image exceeds the ${MAX_OCR_INPUT_PIXELS / 1_000_000} megapixel OCR limit`,
      );
    }
    throw invalidImageError();
  }
};

export const OCR_IMAGE_PIXEL_LIMIT = MAX_OCR_INPUT_PIXELS;
