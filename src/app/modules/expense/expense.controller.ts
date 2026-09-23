/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { ExpenseService } from './expense.service';
import { ExpenseValidation } from './expense.validation';

const createExpense = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;

    let bodyData = req.body;
    if (req.body.data) {
      bodyData = ExpenseValidation.createExpenseZodSchema.parse(
        JSON.parse(req.body.data),
      );
    }

    const { amount, category, date, description } = bodyData;

    let fileUrl: string | undefined;
    let fileKey: string | undefined;

    const files = req.files as any;
    const docFile = files?.doc?.[0];
    const imageFile = files?.image?.[0];
    const selectedFile = docFile || imageFile;

    if (selectedFile?.buffer) {
      const { url, key } = await s3Uploader.uploadBufferToS3(
        selectedFile.buffer,
        selectedFile.originalname,
        selectedFile.mimetype,
        'expense',
      );
      fileUrl = url;
      fileKey = key;
    }

    let result;
    try {
      result = await ExpenseService.createExpenseToDB(user, {
        amount: Number(amount),
        category,
        date: new Date(date),
        description,
        fileUrl,
        fileKey,
      });
    } catch (error) {
      if (fileKey) {
        try {
          await s3Uploader.deleteByKey(fileKey);
        } catch {
          // Preserve the database error; failed cleanup can be retried from logs.
        }
      }
      throw error;
    }

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Expense recorded successfully',
      data: result,
    });
  },
);

const getExpenses = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await ExpenseService.getExpenseFromDB(user, req.query);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message:
      result.mode === 'detailed'
        ? 'Expense list retrieved successfully'
        : 'Monthly expense summary retrieved successfully',
    pagination: result.pagination,
    data: result.data as any,
  });
});

const updateExpense = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const { id } = req.params as any;

    let bodyData = req.body;
    if (req.body.data) {
      bodyData = ExpenseValidation.updateExpenseZodSchema.parse(
        JSON.parse(req.body.data),
      );
    }

    let uploadUrl: string | undefined;
    let uploadKey: string | undefined;
    const files = req.files as any;
    const docFile = files?.doc?.[0];
    const imageFile = files?.image?.[0];
    const selectedFile = docFile || imageFile;
    if (selectedFile?.buffer) {
      const { url, key } = await s3Uploader.uploadBufferToS3(
        selectedFile.buffer,
        selectedFile.originalname,
        selectedFile.mimetype,
        'expense',
      );
      uploadUrl = url;
      uploadKey = key;
    }

    const payload: any = { ...bodyData };
    if (payload.amount !== undefined) payload.amount = Number(payload.amount);
    if (payload.date !== undefined) payload.date = new Date(payload.date);
    if (uploadUrl && uploadKey) {
      payload.fileUrl = uploadUrl;
      payload.fileKey = uploadKey;
    }

    let result;
    try {
      result = await ExpenseService.updateExpenseToDB(user, id, payload);
    } catch (error) {
      if (uploadKey) {
        try {
          await s3Uploader.deleteByKey(uploadKey);
        } catch {
          // Preserve the database error; failed cleanup can be retried from logs.
        }
      }
      throw error;
    }

    if (!result && uploadKey) {
      try {
        await s3Uploader.deleteByKey(uploadKey);
      } catch {
        // The missing record remains the authoritative result.
      }
    }
    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.OK,
      message: 'Expense updated successfully',
      data: result,
    });
  },
);

const deleteExpense = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params as any;
  const result = await ExpenseService.deleteExpenseFromDB(user, id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Expense deleted successfully',
    data: result,
  });
});

const getExpenseHistory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const { result, pagination } = await ExpenseService.getExpenseHistoryFromDB(
    user,
    req.query,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Expense history retrieved successfully',
    pagination,
    data: result,
  });
});

export const ExpenseController = {
  createExpense,
  getExpenses,
  updateExpense,
  deleteExpense,
  getExpenseHistory,
};
