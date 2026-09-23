import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { BankTransactionService } from './bankTransaction.service';
import { JwtPayload } from 'jsonwebtoken';

const createBankTransaction = catchAsync(
  async (req: Request, res: Response) => {
    const result = await BankTransactionService.createBankTransactionToDB(
      req.user as JwtPayload,
      req.body,
    );

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Bank transaction created successfully',
      data: result,
    });
  },
);

const getAllBankTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const { result, pagination } =
      await BankTransactionService.getAllBankTransactionsFromDB(
        req.user as JwtPayload,
        req.query,
      );

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Bank transactions retrieved successfully',
      pagination,
      data: result,
    });
  },
);

const updateBankTransaction = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await BankTransactionService.updateBankTransactionToDB(
      req.user as JwtPayload,
      id,
      req.body,
    );

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Bank transaction updated successfully',
      data: result,
    });
  },
);

const deleteBankTransaction = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    await BankTransactionService.deleteBankTransactionToDB(
      req.user as JwtPayload,
      id,
    );

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Bank transaction deleted successfully',
    });
  },
);

export const BankTransactionController = {
  createBankTransaction,
  getAllBankTransactions,
  updateBankTransaction,
  deleteBankTransaction,
};
