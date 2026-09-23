import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { jwtHelper } from '../../../helpers/jwtHelper';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { User } from '../user/user.model';
import { OAuthCode } from './oauthCode.model';

type OAuthUser = {
  _id: { toString(): string };
};

const hashCode = (code: string) =>
  createHash('sha256').update(code).digest('hex');

const issueTokens = (user: {
  _id: { toString(): string };
  role?: string;
  email: string;
}) => {
  const payload = {
    id: user._id.toString(),
    role: user.role || 'USER',
    email: user.email,
  };

  return {
    accessToken: jwtHelper.createToken(
      payload,
      config.jwt.jwt_secret as Secret,
      config.jwt.jwt_expire_in,
    ),
    refreshToken: jwtHelper.createToken(
      payload,
      config.jwt.jwt_refresh_secret as Secret,
      config.jwt.jwt_refresh_expire_in,
    ),
  };
};

const googleCallback = catchAsync(async (req: Request, res: Response) => {
  const oauthUser = req.user as OAuthUser | undefined;
  if (!oauthUser) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Authentication failed');
  }

  const user = await User.findById(oauthUser._id);
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'User does not exist');
  }
  if (user.status === 'block') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'This account is blocked');
  }

  const code = randomBytes(32).toString('base64url');
  await OAuthCode.deleteMany({ user: user._id });
  await OAuthCode.create({
    codeHash: hashCode(code),
    user: user._id,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });

  const redirectUrl = new URL(config.oauth.frontendCallbackURL);
  redirectUrl.searchParams.set('code', code);
  return res.redirect(redirectUrl.toString());
});

const exchangeCode = catchAsync(async (req: Request, res: Response) => {
  const oauthCode = await OAuthCode.findOneAndDelete({
    codeHash: hashCode(req.body.code),
    expiresAt: { $gt: new Date() },
  }).select('+codeHash');

  if (!oauthCode) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      'OAuth code is invalid or expired',
    );
  }

  const user = await User.findById(oauthCode.user);
  if (!user || user.status === 'block') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Account is unavailable');
  }

  return sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'OAuth authentication completed',
    data: { ...issueTokens(user), userId: user._id.toString() },
  });
});

const getProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload | undefined;
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
  }

  return sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'User profile retrieved successfully',
    data: user,
  });
});

const getOAuthStatus = catchAsync(async (_req: Request, res: Response) => {
  return sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'OAuth provider status retrieved',
    data: {
      google: {
        configured: config.oauth.google.enabled,
        name: 'Google',
      },
    },
  });
});

export const OAuthController = {
  exchangeCode,
  googleCallback,
  getProfile,
  getOAuthStatus,
};
