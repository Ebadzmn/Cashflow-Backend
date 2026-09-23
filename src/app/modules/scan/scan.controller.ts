/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiError';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { ScanService } from './scan.service';

const extractAndCreateExpense = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const file = req.file;

    if (!file) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'No file uploaded');
    }

    const result = await ScanService.extractAndCreateExpenseFromImage(
      user,
      file,
    );

    sendResponse(res, {
      success: true,
      statusCode: StatusCodes.CREATED,
      message: 'Expense created successfully',
      data: result,
    });
  },
);

const updateExpense = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const { id } = req.params;
  const updatedData = req.body;

  const result = await ScanService.updateExpenseInDB(user, id, updatedData);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Expense updated successfully',
    data: result,
  });
});

export const ScanController = {
  extractAndCreateExpense,
  updateExpense,
};
