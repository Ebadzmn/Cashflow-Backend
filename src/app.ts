import compression from 'compression';
import cors from 'cors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import passport from 'passport';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import {
  apiRateLimiter,
  attachRequestId,
  authRateLimiter,
  expensiveOperationRateLimiter,
} from './app/middlewares/security';
import { initializePassport } from './config/passport';
import config from './config';
import ApiError from './errors/ApiError';
import router from './routes';
import { Morgan } from './shared/morgen';
const app = express();

app.disable('x-powered-by');
app.locals.isShuttingDown = false;
if (config.node_env === 'production') {
  app.set('trust proxy', config.trust_proxy_hops);
}

app.use(attachRequestId);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity:
      config.node_env === 'production'
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
  }),
);
app.use(compression());

// Request logging
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        config.cors_origins.includes('*') ||
        config.cors_origins.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new ApiError(StatusCodes.FORBIDDEN, 'Origin is not allowed'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  }),
);

// Handle Private Network Access preflight (CORS-RFC1918)
// app.use((req, res, next) => {
//   if (req.headers['access-control-request-private-network']) {
//     res.setHeader('Access-Control-Allow-Private-Network', 'true');
//   }
//   next();
// });
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

//initialize Passport.js
initializePassport();
app.use(passport.initialize());

app.get('/health/live', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(StatusCodes.OK).json({
    status: 'ok',
    service: 'cashflow-api',
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const ready =
    mongoose.connection.readyState === 1 && !app.locals.isShuttingDown;
  res.status(ready ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE).json({
    status: ready ? 'ready' : 'not_ready',
    database:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.use(['/api/v1/auth', '/api/v1/oauth'], authRateLimiter);
app.use(
  ['/api/v1/scan', '/api/v1/ocr', '/api/v1/reports'],
  expensiveOperationRateLimiter,
);
app.use('/api/v1', apiRateLimiter);

//router
app.use('/api/v1', router);

app.get('/', (req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    service: 'cashflow-api',
    status: 'ok',
    requestId: req.requestId,
  });
});

//global error handle
app.use(globalErrorHandler);

//handle not found route;
app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: 'Not found',
    requestId: req.requestId,
    errorMessages: [
      {
        path: req.originalUrl,
        message: "API DOESN'T EXIST",
      },
    ],
  });
});

export default app;
