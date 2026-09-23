import express from 'express';
import { USER_ROLES } from '../../../enums/user';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { BankTransactionController } from './bankTransaction.controller';
import { BankTransactionValidation } from './bankTransaction.validation';

const router = express.Router();

router
  .route('/')
  .post(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    validateRequest(BankTransactionValidation.createBankTransactionZodSchema),
    BankTransactionController.createBankTransaction,
  )
  .get(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    BankTransactionController.getAllBankTransactions,
  );

router
  .route('/:id')
  .patch(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    validateRequest(BankTransactionValidation.updateBankTransactionZodSchema),
    BankTransactionController.updateBankTransaction,
  )
  .delete(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    BankTransactionController.deleteBankTransaction,
  );

export const BankTransactionRoutes = router;
