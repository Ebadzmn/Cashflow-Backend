import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import { createLogger, format, transports } from 'winston';
const { combine, errors, json, timestamp, label, printf } = format;

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';
const isTest = environment === 'test';

const formatLevel = (level: string) => {
  switch (level.toLowerCase()) {
    case 'info':
      return '\x1b[32m[INFO]\x1b[0m';
    case 'error':
      return '\x1b[31;1m[ERROR]\x1b[0m';
    case 'warn':
      return '\x1b[33m[WARN]\x1b[0m';
    case 'debug':
      return '\x1b[35m[DEBUG]\x1b[0m';
    default:
      return `[${level.toUpperCase()}]`;
  }
};

const myFormat = printf(info => {
  const date = new Date(String(info.timestamp));
  const timeStr = date.toTimeString().split(' ')[0];
  let extra = '';

  if (info.stack) {
    extra = `\n\x1b[31m${String(info.stack)}\x1b[0m`;
  } else if (info.error) {
    if (typeof info.error === 'object') {
      const errObj = info.error as Record<string, unknown>;
      extra = errObj.stack
        ? `\n\x1b[31m${String(errObj.stack)}\x1b[0m`
        : errObj.message
          ? `\n\x1b[31mReason: ${String(errObj.message)}\x1b[0m`
          : `\n\x1b[31m${JSON.stringify(info.error, null, 2)}\x1b[0m`;
    } else {
      extra = `\n\x1b[31mReason: ${String(info.error)}\x1b[0m`;
    }
  }

  return `\x1b[90m${timeStr}\x1b[0m \x1b[36m[CashFlow]\x1b[0m ${formatLevel(info.level)} ${String(info.message)}${extra}`;
});

const logFormat = isProduction
  ? combine(timestamp(), errors({ stack: true }), json())
  : combine(label({ label: 'CASHFLOW-API' }), timestamp(), myFormat);

const applicationTransports: import('winston').transport[] = [
  new transports.Console({ silent: isTest }),
];
const errorTransports: import('winston').transport[] = [
  new transports.Console({ silent: isTest }),
];

if (!isProduction && !isTest) {
  applicationTransports.push(
    new DailyRotateFile({
      filename: path.join(
        process.cwd(),
        'winston',
        'success',
        '%DATE%-success.log',
      ),
      datePattern: 'DD-MM-YYYY-HH',
      maxSize: '20m',
      maxFiles: '1d',
    }),
  );
  errorTransports.push(
    new DailyRotateFile({
      filename: path.join(
        process.cwd(),
        'winston',
        'error',
        '%DATE%-error.log',
      ),
      datePattern: 'DD-MM-YYYY-HH',
      maxSize: '20m',
      maxFiles: '1d',
    }),
  );
}

const logger = createLogger({
  level: 'info',
  format: logFormat,
  transports: applicationTransports,
});

const errorLogger = createLogger({
  level: 'error',
  format: logFormat,
  transports: errorTransports,
});

const errorContext = (error: unknown) => ({
  error:
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : String(error),
});

export { errorContext, errorLogger, logger };
