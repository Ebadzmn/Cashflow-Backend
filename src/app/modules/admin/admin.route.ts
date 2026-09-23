import express from 'express';
import auth from '../../middlewares/auth';
import { USER_ROLES } from '../../../enums/user';
import { AdminController } from './admin.controller';

const router = express.Router();

router
  .route('/dashboard')
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AdminController.getDashboardData,
  );

router
  .route('/subscribers')
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AdminController.getAllSubscribers,
  );

router
  .route('/monthly-revenue')
  .get(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AdminController.getMonthlyRevenue,
  );

router
  .route('/delete-account/:id')
  .delete(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AdminController.deleteAccount,
  );

router
  .route('/update-user/:id')
  .patch(
    auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
    AdminController.updateUser,
  );

export const AdminRoutes = router;
