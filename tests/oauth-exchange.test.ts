/* eslint-disable no-undef */
jest.mock('../src/app/modules/passport/oauthCode.model', () => ({
  OAuthCode: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findOneAndDelete: jest.fn(),
  },
}));

jest.mock('../src/app/modules/user/user.model', () => ({
  User: {
    findById: jest.fn(),
  },
}));

import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import app from '../src/app';
import { OAuthController } from '../src/app/modules/passport/oauth.controller';
import { OAuthCode } from '../src/app/modules/passport/oauthCode.model';
import { User } from '../src/app/modules/user/user.model';
import config from '../src/config';

const user = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  email: 'oauth@example.com',
  role: 'USER',
  status: 'active',
};

describe('OAuth one-time exchange', () => {
  it('redirects with a short-lived code and never puts tokens in the URL', async () => {
    const callbackUrl = config.oauth.frontendCallbackURL;
    config.oauth.frontendCallbackURL = 'https://app.example.com/auth/callback';
    (User.findById as jest.Mock).mockResolvedValue(user);
    (OAuthCode.deleteMany as jest.Mock).mockResolvedValue(undefined);
    (OAuthCode.create as jest.Mock).mockResolvedValue(undefined);
    const redirect = jest.fn();

    await OAuthController.googleCallback(
      { user } as unknown as Request,
      { redirect } as unknown as Response,
      jest.fn() as NextFunction,
    );

    config.oauth.frontendCallbackURL = callbackUrl;
    const target = new URL(redirect.mock.calls[0][0]);
    expect(target.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{40,128}$/);
    expect(target.searchParams.has('accessToken')).toBe(false);
    expect(target.searchParams.has('refreshToken')).toBe(false);
    expect(OAuthCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('atomically consumes a code and returns signed tokens', async () => {
    const select = jest.fn().mockResolvedValue({ user: user._id });
    (OAuthCode.findOneAndDelete as jest.Mock).mockReturnValue({ select });
    (User.findById as jest.Mock).mockResolvedValue(user);

    const response = await request(app)
      .post('/api/v1/oauth/exchange')
      .send({ code: 'A'.repeat(43) });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      userId: user._id.toString(),
    });
    expect(OAuthCode.findOneAndDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: { $gt: expect.any(Date) },
      }),
    );
    expect(select).toHaveBeenCalledWith('+codeHash');
  });

  it('rejects an invalid or already consumed code', async () => {
    const select = jest.fn().mockResolvedValue(null);
    (OAuthCode.findOneAndDelete as jest.Mock).mockReturnValue({ select });

    const response = await request(app)
      .post('/api/v1/oauth/exchange')
      .send({ code: 'B'.repeat(43) });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('OAuth code is invalid or expired');
  });
});
