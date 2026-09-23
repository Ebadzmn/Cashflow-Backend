import express from 'express';
import auth from '../../middlewares/auth';
import { ScanController } from './scan.controller';
import validateRequest from '../../middlewares/validateRequest';
// import { ENUM_USER_ROLES } from '../../../enums/user';
import { ocrUpload } from '../../../helpers/multer';
import { ScanValidation } from './scan.validation';
import { USER_ROLES } from '../../../enums/user';

const router = express.Router();

router.post(
  '/extract-review',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  ocrUpload.single('file'), // 'file' is the field name for the uploaded image
  ScanController.extractAndCreateExpense,
);

router.patch(
  '/:id',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  validateRequest(ScanValidation.updateExpenseZodSchema),
  ScanController.updateExpense,
);

export const ScanRoutes = router;
