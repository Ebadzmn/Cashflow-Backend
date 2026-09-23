import { ErrorRequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import config from '../../config';
import ApiError from '../../errors/ApiError';
import handleValidationError from '../../errors/handleValidationError';
import handleZodError from '../../errors/handleZodError';
import { errorLogger } from '../../shared/logger';
import { IErrorMessage } from '../../types/errors.types';

const globalErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let statusCode = 500;
  let message = 'Something went wrong';
  let errorMessages: IErrorMessage[] = [];

  if (error.name === 'ZodError') {
    const simplifiedError = handleZodError(error);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorMessages = simplifiedError.errorMessages;
  } else if (error.name === 'ValidationError') {
    const simplifiedError = handleValidationError(error);
    statusCode = simplifiedError.statusCode;
    message = simplifiedError.message;
    errorMessages = simplifiedError.errorMessages;
  } else if (
    error.name === 'TokenExpiredError' ||
    error.name === 'JsonWebTokenError' ||
    error.name === 'NotBeforeError'
  ) {
    statusCode = StatusCodes.UNAUTHORIZED;
    message =
      error.name === 'TokenExpiredError' ? 'Session Expired' : 'Invalid token';
    errorMessages = error?.message
      ? [
          {
            path: '',
            message:
              'Your session has expired. Please log in again to continue.',
          },
        ]
      : [];
  } else if (error instanceof multer.MulterError) {
    statusCode =
      error.code === 'LIMIT_FILE_SIZE'
        ? StatusCodes.REQUEST_TOO_LONG
        : StatusCodes.BAD_REQUEST;
    message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'File size must not exceed 5 MB'
        : error.message;
    errorMessages = [{ path: error.field || '', message }];
  } else if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errorMessages = error.message
      ? [
          {
            path: '',
            message: error.message,
          },
        ]
      : [];
  } else if (error instanceof Error) {
    message = config.node_env === 'production' ? message : error.message;
    errorMessages =
      config.node_env !== 'production' && error.message
        ? [
            {
              path: '',
              message: error?.message,
            },
          ]
        : [];
  }

  if (statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    errorLogger.error('Request failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorMessages,
    requestId: req.requestId,
    stack: config.node_env !== 'production' ? error?.stack : undefined,
  });
};

export default globalErrorHandler;
