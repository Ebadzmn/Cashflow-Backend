import express from 'express';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import fileUploadHandler from '../../middlewares/fileUploadHandler';
import validateRequest from '../../middlewares/validateRequest';
import { NoticeController } from './notices.controller';
import { NoticeValidation } from './notices.validation';

const router = express.Router();

router.post(
  '/',
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  fileUploadHandler().fields([
    { name: 'doc', maxCount: 1 },
    { name: 'document', maxCount: 1 },
  ]),
  validateRequest(NoticeValidation.createNoticeZodSchema),
  NoticeController.createNotice,
);

router.get(
  '/',
  auth(USER_ROLES.ADMIN, USER_ROLES.USER, USER_ROLES.SUPER_ADMIN),
  NoticeController.getAllNotices,
);

router.delete(
  '/:id',
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  NoticeController.deleteNotice,
);

export const NoticeRoutes = router;
