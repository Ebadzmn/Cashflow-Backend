import express, { NextFunction, Request, Response } from 'express';
import auth from '../../middlewares/auth';
import { USER_ROLES } from '../../../enums/user';
import { AuditRiskController } from './auditRisk.controller';

const router = express.Router();

router.get(
  '/',
  auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
  (req: Request, res: Response, next: NextFunction) => {
    return AuditRiskController.getAuditRiskCount(req, res, next);
  },
);

export const AuditRiskRoutes = router;
