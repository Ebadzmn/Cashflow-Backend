import { StatusCodes } from 'http-status-codes';
import sharp from 'sharp';
import {
  normalizeImageForOCR,
  OCR_IMAGE_PIXEL_LIMIT,
} from '../src/helpers/ocrImage';

// 64x64 HEIC fixture from strukturag/libheif's LGPL-licensed fuzz corpus.
const VALID_HEIC_BASE64 =
  'AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABLm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAiaWxvYwAAAABEQAABAAEAAAAAAU4AAQAAAAAAAAClAAAAI2lpbmYAAAAAAAEAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAACuaXBycAAAAJFpcGNvAAAAdWh2Y0MBA3AAAAAAAAAAAAAe8AD8/fj4AAAPAyAAAQAYQAEMAf//A3AAAAMAkAAAAwAAAwAeugJAIQABAChCAQEDcAAAAwCQAAADAAADAB6gIIEFlupJKa5sCAAAAwAIAAADAAhAIgABAAdEAcFysCJAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAVaXBtYQAAAAAAAAABAAECgQIAAACtbWRhdAAAAKEmAa8TgIGSEXXAGM2sfMMD8HKXsBNBYjkEW6//QKl1HfLCc/SN/bWOG2ARaa8rk4JsxRuKJFz/vIlnrSBv0Pk7pYMv503LniUfVt0RGOMyTBZVcbnDhlXs0nsTVObq7679Fh7MfXPARYndCrwpKWSNTQcCjNVYWPVOenDxU81lLBnE070xnN107IoLiTNywdiNWzedf/q6zzV3iwZflrO94A==';

const makeImage = (format: 'webp' | 'tiff') => {
  const image = sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: '#ffffff',
    },
  });
  return format === 'webp' ? image.webp().toBuffer() : image.tiff().toBuffer();
};

const makeHeicContainer = () => {
  const input = Buffer.alloc(44);
  input.writeUInt32BE(20, 0);
  input.write('ftyp', 4, 'ascii');
  input.write('heic', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  input.write('mif1', 16, 'ascii');
  input.writeUInt32BE(20, 20);
  input.write('ispe', 24, 'ascii');
  input.writeUInt32BE(0, 28);
  input.writeUInt32BE(8, 32);
  input.writeUInt32BE(6, 36);
  return input;
};

describe('OCR image normalization', () => {
  it.each(['webp', 'tiff'] as const)(
    'normalizes %s input to a bounded PNG',
    async format => {
      const normalized = await normalizeImageForOCR(await makeImage(format));
      const metadata = await sharp(normalized).metadata();

      expect(metadata).toMatchObject({ format: 'png', width: 8, height: 6 });
    },
  );

  it('decodes a real HEIC image through the portable converter', async () => {
    const input = Buffer.from(VALID_HEIC_BASE64, 'base64');

    const normalized = await normalizeImageForOCR(input, 'image/heic');

    await expect(sharp(normalized).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 64,
      height: 64,
    });
  });

  it('returns a clean 400 for corrupt or unsupported image data', async () => {
    await expect(
      normalizeImageForOCR(Buffer.from('not an image'), 'image/webp'),
    ).rejects.toMatchObject({
      statusCode: StatusCodes.BAD_REQUEST,
      message: 'Unsupported or invalid image file',
    });
  });

  it('rejects HEIC dimensions above the OCR pixel limit before conversion', async () => {
    const input = makeHeicContainer();
    input.writeUInt32BE(OCR_IMAGE_PIXEL_LIMIT, 32);
    input.writeUInt32BE(2, 36);

    await expect(
      normalizeImageForOCR(input, 'image/heic'),
    ).rejects.toMatchObject({
      statusCode: StatusCodes.BAD_REQUEST,
      message: expect.stringContaining('megapixel OCR limit'),
    });
  });
});
