import express, { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionValidation } from './subscription.validation';

const router = express.Router();

const requireAppleSubscriptions = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!config.apple.enabled) {
    next(
      new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Apple subscriptions are not enabled',
      ),
    );
    return;
  }
  next();
};

const requireGoogleSubscriptions = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!config.google.enabled) {
    next(
      new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Google subscriptions are not enabled',
      ),
    );
    return;
  }
  next();
};

const authenticated = auth(
  USER_ROLES.USER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
);
const admin = auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN);

// General subscription status and history for authenticated user
router.get('/status', authenticated, SubscriptionController.getStatus);
router.get('/history', authenticated, SubscriptionController.getHistory);

// Apple endpoints (protected by requireAppleSubscriptions)
router.post(
  '/verify',
  requireAppleSubscriptions,
  authenticated,
  validateRequest(SubscriptionValidation.verifyPurchase),
  SubscriptionController.verifyPurchase,
);
router.post(
  '/restore',
  requireAppleSubscriptions,
  authenticated,
  validateRequest(SubscriptionValidation.restorePurchase),
  SubscriptionController.restorePurchase,
);
router.post(
  '/notifications/test',
  requireAppleSubscriptions,
  admin,
  validateRequest(SubscriptionValidation.notificationTest),
  SubscriptionController.notificationTest,
);
router.post(
  '/notifications/history',
  requireAppleSubscriptions,
  admin,
  validateRequest(SubscriptionValidation.notificationHistory),
  SubscriptionController.notificationHistory,
);
router.get(
  '/notifications/history/:notificationId',
  requireAppleSubscriptions,
  admin,
  SubscriptionController.notificationDetails,
);

// Google endpoints (protected by requireGoogleSubscriptions)
router.post(
  '/google/verify',
  requireGoogleSubscriptions,
  authenticated,
  validateRequest(SubscriptionValidation.verifyGooglePurchase),
  SubscriptionController.verifyGooglePurchase,
);

const appleWebhookRouter = express.Router();
appleWebhookRouter.use(requireAppleSubscriptions);
appleWebhookRouter.post(
  '/webhook',
  validateRequest(SubscriptionValidation.webhook),
  SubscriptionController.webhook,
);

const googleWebhookRouter = express.Router();
googleWebhookRouter.use(requireGoogleSubscriptions);
googleWebhookRouter.post(
  '/webhook',
  validateRequest(SubscriptionValidation.googleWebhook),
  SubscriptionController.googleWebhook,
);

export const SubscriptionRoutes = router;
export const AppleWebhookRoutes = appleWebhookRouter;
export const GoogleWebhookRoutes = googleWebhookRouter;
