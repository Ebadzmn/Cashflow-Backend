import express from 'express';
import auth from '../../middlewares/auth';
import { USER_ROLES } from '../../../enums/user';
import { ReportController } from './report.controller';

const router = express.Router();

router.get(
  '/pdf',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  ReportController.generatePDF,
);

router.get(
  '/excel',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  ReportController.generateExcel,
);

router.get(
  '/csv',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  ReportController.generateCSV,
);

export const ReportRoutes = router;
