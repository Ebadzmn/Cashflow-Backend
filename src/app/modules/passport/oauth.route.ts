import express, { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import passport from 'passport';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { OAuthController } from './oauth.controller';
import { OAuthValidation } from './oauth.validation';

const router: Router = express.Router();

const requireGoogleOAuth = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!config.oauth.google.enabled) {
    next(
      new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Google OAuth is not enabled',
      ),
    );
    return;
  }
  next();
};

router.get(
  '/google',
  requireGoogleOAuth,
  passport.authenticate('google', { scope: ['profile', 'email'] }),
);

router.get(
  '/google/callback',
  requireGoogleOAuth,
  passport.authenticate('google', {
    failureRedirect: '/api/v1/oauth/login-failed',
    session: false,
  }),
  OAuthController.googleCallback,
);

router.post(
  '/exchange',
  validateRequest(OAuthValidation.exchangeCode),
  OAuthController.exchangeCode,
);
router.get('/profile', auth(), OAuthController.getProfile);
router.get('/status', OAuthController.getOAuthStatus);
router.get('/login-failed', (_req, res) => {
  res.status(StatusCodes.UNAUTHORIZED).json({
    success: false,
    message: 'OAuth login failed',
  });
});

export const OAuthRoutes = router;
