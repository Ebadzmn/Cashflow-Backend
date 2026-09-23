/* eslint-disable no-undef */
jest.mock('../src/helpers/s3Uploader', () => ({
  s3Uploader: {
    uploadBufferToS3: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    deleteByKey: jest.fn(),
  },
}));

jest.mock('../src/config', () => ({
  __esModule: true,
  default: {
    storage: {
      s3: {
        bucket: 'cashflowiq-uploads',
        region: 'us-east-2',
      },
      cloudfrontDomain: '',
    },
  },
}));

jest.mock('../src/app/modules/notices/notices.model', () => ({
  Notice: {
    create: jest.fn(),
    find: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

import { Express, NextFunction, Request, Response } from 'express';
import { NoticeController } from '../src/app/modules/notices/notices.controller';
import { Notice } from '../src/app/modules/notices/notices.model';
import { NoticesService } from '../src/app/modules/notices/notices.service';
import { s3Uploader } from '../src/helpers/s3Uploader';

type NoticeRecord = {
  type: 'IRS Notice' | 'Case Status';
  document: string;
  documentKey?: string;
  toJSON?: () => Record<string, unknown>;
};

const makeNoticeQuery = (notices: NoticeRecord[]) => {
  const query = {
    select: jest.fn(),
    find: jest.fn(),
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    getFilter: jest.fn().mockReturnValue({}),
    model: {
      countDocuments: jest.fn().mockResolvedValue(notices.length),
    },
    then: (
      resolve: (value: NoticeRecord[]) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(notices).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.find.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
};

describe('notice S3 download URLs', () => {
  it('prevents authenticated notice responses from caching expiring URLs', async () => {
    jest.spyOn(NoticesService, 'getAllNotices').mockResolvedValue({
      result: [],
      pagination: { page: 1, limit: 10, totalPage: 0, total: 0 },
    });
    const request = { query: {} } as Request;
    const response = {
      set: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const next = jest.fn() as NextFunction;

    await NoticeController.getAllNotices(
      request,
      response as unknown as Response,
      next,
    );

    expect(response.set).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns short-lived signed URLs and does not expose object keys', async () => {
    const noticeWithKey: NoticeRecord = {
      type: 'Case Status',
      document:
        'https://cashflowiq-uploads.s3.us-east-2.amazonaws.com/notices/current.pdf',
      documentKey: 'notices/current.pdf',
      toJSON() {
        return {
          type: this.type,
          document: this.document,
          documentKey: this.documentKey,
        };
      },
    };
    const legacyNotice: NoticeRecord = {
      type: 'IRS Notice',
      document:
        'https://cashflowiq-uploads.s3.us-east-2.amazonaws.com/notices/old%20notice.pdf',
    };
    const unrelatedUrl: NoticeRecord = {
      type: 'IRS Notice',
      document: 'https://example.com/notices/current.pdf',
    };
    const query = makeNoticeQuery([noticeWithKey, legacyNotice, unrelatedUrl]);
    (Notice.find as jest.Mock).mockReturnValue(query);
    (s3Uploader.getSignedDownloadUrl as jest.Mock).mockImplementation(
      async (key: string) =>
        `https://signed.example/${encodeURIComponent(key)}`,
    );

    const response = await NoticesService.getAllNotices({});

    expect(query.select).toHaveBeenCalledWith('+documentKey');
    expect(s3Uploader.getSignedDownloadUrl).toHaveBeenCalledTimes(2);
    expect(s3Uploader.getSignedDownloadUrl).toHaveBeenNthCalledWith(
      1,
      'notices/current.pdf',
    );
    expect(s3Uploader.getSignedDownloadUrl).toHaveBeenNthCalledWith(
      2,
      'notices/old notice.pdf',
    );
    expect(response.result).toEqual([
      {
        type: 'Case Status',
        document: 'https://signed.example/notices%2Fcurrent.pdf',
      },
      {
        type: 'IRS Notice',
        document: 'https://signed.example/notices%2Fold%20notice.pdf',
      },
      unrelatedUrl,
    ]);
    expect(response.pagination).toEqual({
      page: 1,
      limit: 10,
      totalPage: 1,
      total: 3,
    });
  });

  it('persists the stable URL/key but returns a signed URL after creation', async () => {
    const file = {
      buffer: Buffer.from('pdf'),
      originalname: 'case-status.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    const stableUrl =
      'https://cashflowiq-uploads.s3.us-east-2.amazonaws.com/notices/generated.pdf';
    (s3Uploader.uploadBufferToS3 as jest.Mock).mockResolvedValue({
      key: 'notices/generated.pdf',
      url: stableUrl,
    });
    (s3Uploader.getSignedDownloadUrl as jest.Mock).mockResolvedValue(
      'https://signed.example/generated',
    );
    (Notice.create as jest.Mock).mockImplementation(async payload => ({
      ...payload,
      toJSON: () => ({ ...payload }),
    }));

    const response = await NoticesService.createNotice(
      { type: 'Case Status' },
      file,
    );

    expect(Notice.create).toHaveBeenCalledWith({
      type: 'Case Status',
      document: stableUrl,
      documentKey: 'notices/generated.pdf',
    });
    expect(response).toEqual({
      type: 'Case Status',
      document: 'https://signed.example/generated',
    });
  });

  it('removes an uploaded object when URL signing fails before creation', async () => {
    const file = {
      buffer: Buffer.from('pdf'),
      originalname: 'case-status.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    (s3Uploader.uploadBufferToS3 as jest.Mock).mockResolvedValue({
      key: 'notices/orphan.pdf',
      url: 'https://bucket.example/notices/orphan.pdf',
    });
    (s3Uploader.getSignedDownloadUrl as jest.Mock).mockRejectedValue(
      new Error('credentials unavailable'),
    );
    (s3Uploader.deleteByKey as jest.Mock).mockResolvedValue(undefined);

    await expect(
      NoticesService.createNotice({ type: 'Case Status' }, file),
    ).rejects.toMatchObject({ message: 'Failed to upload notice.' });

    expect(Notice.create).not.toHaveBeenCalled();
    expect(s3Uploader.deleteByKey).toHaveBeenCalledWith('notices/orphan.pdf');
  });

  it('decodes and deletes the key for a legacy notice URL', async () => {
    const legacyNotice: NoticeRecord = {
      type: 'Case Status',
      document:
        'https://cashflowiq-uploads.s3.us-east-2.amazonaws.com/notices/old%20notice.pdf',
    };
    const deletionQuery = {
      select: jest.fn().mockResolvedValue(legacyNotice),
    };
    (Notice.findByIdAndDelete as jest.Mock).mockReturnValue(deletionQuery);
    (s3Uploader.deleteByKey as jest.Mock).mockResolvedValue(undefined);

    await expect(NoticesService.deleteNotice('notice-id')).resolves.toBe(
      legacyNotice,
    );

    expect(deletionQuery.select).toHaveBeenCalledWith('+documentKey');
    expect(s3Uploader.deleteByKey).toHaveBeenCalledWith(
      'notices/old notice.pdf',
    );
  });
});
