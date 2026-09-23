import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { OCRService } from './ocr.service';

const analyzeReceipt = catchAsync(async (req: Request, res: Response) => {
  const { text } = req.body;
  const file = req.file;

  let result;
  if (file) {
    result = await OCRService.analyzeReceipt(file.buffer, file.mimetype);
  } else if (text) {
    result = await OCRService.analyzeReceipt(text);
  } else {
    throw new Error('Please provide a receipt image or text content');
  }

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Receipt analyzed successfully',
    data: result,
  });
});

export const OCRController = {
  analyzeReceipt,
};
