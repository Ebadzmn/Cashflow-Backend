/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer, { FileFilterCallback } from 'multer';
import ApiError from '../../errors/ApiError';

import { imageMimeTypes, ocrImageExtension } from '../../helpers/multer';

const fileUploadHandler = () => {
  const filterFilter = (req: Request, file: any, cb: FileFilterCallback) => {
    if (file.fieldname === 'image') {
      const normalizedMime = (file.mimetype || '').toLowerCase();
      const isAllowed =
        imageMimeTypes.has(normalizedMime) ||
        ((normalizedMime === 'application/octet-stream' ||
          !normalizedMime ||
          normalizedMime === 'image/*') &&
          ocrImageExtension.test(file.originalname));

      if (isAllowed) {
        cb(null, true);
      } else {
        cb(
          new ApiError(
            StatusCodes.BAD_REQUEST,
            'Supported image formats are JPEG, PNG, WebP, HEIC/HEIF, TIFF, GIF, BMP, and AVIF',
          ),
        );
      }
    } else if (file.fieldname === 'media') {
      if (file.mimetype === 'video/mp4' || file.mimetype === 'audio/mpeg') {
        cb(null, true);
      } else {
        cb(
          new ApiError(
            StatusCodes.BAD_REQUEST,
            'Only .mp4, .mp3, file supported',
          ),
        );
      }
    } else if (file.fieldname === 'doc' || file.fieldname === 'document') {
      if (
        file.mimetype === 'application/pdf' ||
        file.mimetype === 'application/msword' ||
        file.mimetype ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        cb(null, true);
      } else {
        cb(
          new ApiError(
            StatusCodes.BAD_REQUEST,
            'Only .pdf, .doc, .docx supported',
          ),
        );
      }
    } else {
      cb(new ApiError(StatusCodes.BAD_REQUEST, 'This file is not supported'));
    }
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: filterFilter,
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 2,
      fields: 20,
      parts: 25,
    },
  });
  return upload;
};

export default fileUploadHandler;
