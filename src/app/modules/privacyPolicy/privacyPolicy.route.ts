import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { PrivacyPolicyController } from './privacyPolicy.controller';
import { PrivacyPolicyValidation } from './privacyPolicy.validation';
import { USER_ROLES } from '../../../enums/user';

const router = express.Router();

router.post(
  '/',
  validateRequest(PrivacyPolicyValidation.createPrivacyPolicyZodSchema),
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  PrivacyPolicyController.createPrivacyPolicy,
);

router.get('/', PrivacyPolicyController.getAllPrivacyPolicies);
router.get('/:id', PrivacyPolicyController.getSinglePrivacyPolicy);

router.patch(
  '/:id',
  validateRequest(PrivacyPolicyValidation.updatePrivacyPolicyZodSchema),
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  PrivacyPolicyController.updatePrivacyPolicy,
);

router.delete(
  '/:id',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN),
  PrivacyPolicyController.deletePrivacyPolicy,
);

export const PrivacyPolicyRoutes = router;
