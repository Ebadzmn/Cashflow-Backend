/* eslint-disable no-undef */
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../src/config';
import { s3Uploader } from '../src/helpers/s3Uploader';

describe('S3 download URL signing', () => {
  it('signs a private GetObject request with the configured expiry', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://signed.example/notices/case-status.pdf',
    );

    await expect(
      s3Uploader.getSignedDownloadUrl('/notices/case-status.pdf'),
    ).resolves.toBe('https://signed.example/notices/case-status.pdf');

    const [, command, options] = (getSignedUrl as jest.Mock).mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: config.storage.s3.bucket,
      Key: 'notices/case-status.pdf',
    });
    expect(options).toEqual({
      expiresIn: config.storage.s3.presignedUrlExpiresIn,
    });
  });

  it('rejects an empty object key before signing', async () => {
    await expect(s3Uploader.getSignedDownloadUrl(' / ')).rejects.toThrow(
      'S3 object key is invalid',
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
