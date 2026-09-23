import express, { NextFunction, Request, Response } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from '../../middlewares/fileUploadHandler';
import { USER_ROLES } from '../../../enums/user';
import { IncomeController } from './income.controller';
const router = express.Router();

router.get(
  '/history',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  (req: Request, res: Response, next: NextFunction) => {
    return IncomeController.getIncomeHistory(req, res, next);
  },
);

router
  .route('/')
  .get(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    (req: Request, res: Response, next: NextFunction) => {
      return IncomeController.getIncomes(req, res, next);
    },
  )
  .post(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    fileUploadHandler().fields([
      { name: 'doc', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ]),
    (req: Request, res: Response, next: NextFunction) => {
      return IncomeController.createIncome(req, res, next);
    },
  );

router
  .route('/:id')
  .patch(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    fileUploadHandler().fields([
      { name: 'doc', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ]),
    (req: Request, res: Response, next: NextFunction) => {
      return IncomeController.updateIncome(req, res, next);
    },
  )
  .delete(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    (req: Request, res: Response, next: NextFunction) => {
      return IncomeController.deleteIncome(req, res, next);
    },
  );

export const IncomeRoutes = router;
