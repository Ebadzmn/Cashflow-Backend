import { Request, Response } from 'express';
import morgan from 'morgan';
import config from '../config';
import { errorLogger, logger } from './logger';

morgan.token(
  'message',
  (req: Request, res: Response) => res?.locals.errorMessage || '',
);
morgan.token('request-id', (req: Request) => req.requestId);
morgan.token('safe-url', (req: Request) => req.path);

// Colored method token for dev
morgan.token('colored-method', (req: Request) => {
  const method = req.method;
  switch (method) {
    case 'GET':
      return `\x1b[32m${method}\x1b[0m`;
    case 'POST':
      return `\x1b[36m${method}\x1b[0m`;
    case 'PUT':
      return `\x1b[33m${method}\x1b[0m`;
    case 'PATCH':
      return `\x1b[35m${method}\x1b[0m`;
    case 'DELETE':
      return `\x1b[31m${method}\x1b[0m`;
    default:
      return method;
  }
});

// Colored status token for dev
morgan.token('colored-status', (_req: Request, res: Response) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31;1m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
});

const getIpFormat = () =>
  config.node_env === 'development' ? ':remote-addr - ' : '';

const successResponseFormat =
  config.node_env === 'development'
    ? `${getIpFormat()}:colored-method :safe-url :colored-status \x1b[90m:response-time ms\x1b[0m`
    : `${getIpFormat()}:request-id :method :safe-url :status - :response-time ms`;

const errorResponseFormat =
  config.node_env === 'development'
    ? `${getIpFormat()}:colored-method :safe-url :colored-status \x1b[90m:response-time ms\x1b[0m`
    : `${getIpFormat()}:request-id :method :safe-url :status - :response-time ms`;

const successHandler = morgan(successResponseFormat, {
  skip: (req: Request, res: Response) => res.statusCode >= 400,
  stream: { write: (message: string) => logger.info(message.trim()) },
});

const errorHandler = morgan(errorResponseFormat, {
  skip: (req: Request, res: Response) => res.statusCode < 400,
  stream: { write: (message: string) => errorLogger.error(message.trim()) },
});

export const Morgan = { errorHandler, successHandler };
