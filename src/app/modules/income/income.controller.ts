/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { IncomeService } from './income.service';
import { IncomeValidation } from './income.validation';

const createIncome = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;

    let bodyData = req.body;
    if (req.body.data) {
      bodyData = IncomeValidation.createIncomeZodSchema.parse(
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
        'income',
      );
      fileUrl = url;
      fileKey = key;
    }

    let result;
    try {
      result = await IncomeService.createIncomeToDB(user, {
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
      message: 'Income recorded successfully',
      data: result,
    });
  },
);

const getIncomes = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await IncomeService.getIncomeFromDB(user, req.query);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message:
      result.mode === 'detailed'
        ? 'Income list retrieved successfully'
        : 'Monthly income summary retrieved successfully',
    pagination: result.pagination,
    data: result.data as any,
  });
});

const updateIncome = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    const { id } = req.params as any;

    let bodyData = req.body;
    if (req.body.data) {
      bodyData = IncomeValidation.updateIncomeZodSchema.parse(
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
        'income',
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
      result = await IncomeService.updateIncomeToDB(user, id, payload);
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
      message: 'Income updated successfully',
      data: result,
    });
  },
);

const deleteIncome = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params as any;
  const result = await IncomeService.deleteIncomeFromDB(user, id);
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Income deleted successfully',
    data: result,
  });
});

const getIncomeHistory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const { result, pagination } = await IncomeService.getIncomeHistoryFromDB(
    user,
    req.query,
  );
  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Income history retrieved successfully',
    pagination,
    data: result,
  });
});

export const IncomeController = {
  createIncome,
  getIncomes,
  updateIncome,
  deleteIncome,
  getIncomeHistory,
};
