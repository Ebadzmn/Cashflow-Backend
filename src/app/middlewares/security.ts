import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';
import config from '../../config';

const rateLimitHandler = (req: Request, res: Response) => {
  res.status(StatusCodes.TOO_MANY_REQUESTS).json({
    success: false,
    message: 'Too many requests. Please try again later.',
    requestId: req.requestId,
  });
};

const limiter = (max: number) =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

export const apiRateLimiter = limiter(config.rateLimit.max);
export const authRateLimiter = limiter(config.rateLimit.authMax);
export const expensiveOperationRateLimiter = limiter(
  config.rateLimit.expensiveMax,
);

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

export const attachRequestId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const suppliedRequestId = req.get('x-request-id');
  req.requestId =
    suppliedRequestId && requestIdPattern.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
