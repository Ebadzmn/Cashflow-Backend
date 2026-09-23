import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { TermsAndConditionsController } from './termsAndConditions.controller';
import { TermsAndConditionsValidation } from './termsAndConditions.validation';
import { USER_ROLES } from '../../../enums/user';

const router = express.Router();

router.post(
  '/',
  validateRequest(
    TermsAndConditionsValidation.createTermsAndConditionsZodSchema,
  ),
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  TermsAndConditionsController.createTermsAndConditions,
);

router.get('/', TermsAndConditionsController.getAllTermsAndConditions);

router.get('/:id', TermsAndConditionsController.getSingleTermsAndConditions);

router.patch(
  '/:id',
  validateRequest(
    TermsAndConditionsValidation.updateTermsAndConditionsZodSchema,
  ),
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  TermsAndConditionsController.updateTermsAndConditions,
);

router.delete(
  '/:id',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  TermsAndConditionsController.deleteTermsAndConditions,
);

export const TermsAndConditionsRoutes = router;
