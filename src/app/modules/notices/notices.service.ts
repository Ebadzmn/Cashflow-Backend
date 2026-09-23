import { Express } from 'express';
import { StatusCodes } from 'http-status-codes';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { INotice } from './notices.interface';
import { Notice } from './notices.model';

import QueryBuilder from '../../../builder/QueryBuilder';
import { errorContext, errorLogger } from '../../../shared/logger';

const hasUnsafeKeyCharacter = (value: string) =>
  [...value].some(character => {
    const codePoint = character.charCodeAt(0);
    return character === '\\' || codePoint < 32 || codePoint === 127;
  });

const isSafeNoticeKey = (key: string) => {
  const segments = key.split('/');
  return (
    key.length <= 1024 &&
    segments.length === 2 &&
    segments[0] === 'notices' &&
    Boolean(segments[1]) &&
    !['.', '..'].includes(segments[1]) &&
    !hasUnsafeKeyCharacter(segments[1])
  );
};

const getLegacyNoticeKey = (documentUrl: string) => {
  try {
    const url = new URL(documentUrl);
    const s3Host = `${config.storage.s3.bucket}.s3.${config.storage.s3.region}.amazonaws.com`;
    const cloudfrontHost = config.storage.cloudfrontDomain
      ? new URL(config.storage.cloudfrontDomain).host
      : undefined;
    if (
      url.protocol !== 'https:' ||
      (url.host !== s3Host && url.host !== cloudfrontHost)
    ) {
      return undefined;
    }

    const segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment));
    const key = segments.join('/');
    return isSafeNoticeKey(key) ? key : undefined;
  } catch {
    return undefined;
  }
};

const getNoticeKey = (notice: INotice) => {
  const documentKey = notice.documentKey?.trim().replace(/^\/+/, '');
  if (documentKey && isSafeNoticeKey(documentKey)) return documentKey;
  return getLegacyNoticeKey(notice.document);
};

const serializeNotice = (notice: INotice) => {
  const noticeWithSerializer = notice as INotice & {
    toJSON?: () => Record<string, unknown>;
  };
  const serialized = noticeWithSerializer.toJSON
    ? noticeWithSerializer.toJSON()
    : { ...notice };
  delete serialized.documentKey;
  return serialized as INotice;
};

const withSignedDocument = async (notice: INotice, signedDocument?: string) => {
  const serialized = serializeNotice(notice);
  const key = getNoticeKey(notice);
  if (!signedDocument && key) {
    signedDocument = await s3Uploader.getSignedDownloadUrl(key);
  }
  return signedDocument
    ? { ...serialized, document: signedDocument }
    : serialized;
};

const createNotice = async (
  payload: Partial<INotice>,
  file: Express.Multer.File,
): Promise<INotice | null> => {
  if (!file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Please upload a notice');
  }

  const { buffer, originalname, mimetype } = file;

  let uploadKey: string | undefined;
  let signedDocument: string | undefined;
  try {
    const uploadResult = await s3Uploader.uploadBufferToS3(
      buffer,
      originalname,
      mimetype,
      'notices',
    );
    uploadKey = uploadResult.key;
    payload.document = uploadResult.url;
    payload.documentKey = uploadResult.key;
    signedDocument = await s3Uploader.getSignedDownloadUrl(uploadResult.key);
  } catch (error) {
    if (uploadKey) {
      await s3Uploader.deleteByKey(uploadKey).catch(cleanupError => {
        errorLogger.error('Notice upload cleanup failed', {
          key: uploadKey,
          ...errorContext(cleanupError),
        });
      });
    }
    errorLogger.error('Notice upload failed', errorContext(error));
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to upload notice.',
    );
  }

  try {
    const notice = await Notice.create(payload);
    return withSignedDocument(notice, signedDocument);
  } catch (error) {
    if (uploadKey) {
      await s3Uploader.deleteByKey(uploadKey).catch(cleanupError => {
        errorLogger.error('Notice upload cleanup failed', {
          key: uploadKey,
          ...errorContext(cleanupError),
        });
      });
    }
    throw error;
  }
};

const getAllNotices = async (query: Record<string, unknown>) => {
  const noticeQuery = new QueryBuilder(
    Notice.find({}).select('+documentKey'),
    query,
  )
    .filter(['type'])
    .sort(['createdAt', 'type'])
    .paginate();

  const notices = await noticeQuery.modelQuery;
  const pagination = await noticeQuery.pagination();
  const result = await Promise.all(
    notices.map(notice => withSignedDocument(notice as unknown as INotice)),
  );

  return { result, pagination };
};

const deleteNotice = async (id: string): Promise<INotice | null> => {
  const isExistNotice =
    await Notice.findByIdAndDelete(id).select('+documentKey');
  if (!isExistNotice) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Notice doesn't exist!");
  }

  const key = getNoticeKey(isExistNotice as unknown as INotice);
  if (key) {
    await s3Uploader.deleteByKey(key).catch(error => {
      errorLogger.error('Notice object deletion failed', {
        key,
        ...errorContext(error),
      });
    });
  }
  return isExistNotice;
};

export const NoticesService = {
  createNotice,
  getAllNotices,
  deleteNotice,
};
