/* eslint-disable no-undef */
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import ApiError from '../../../errors/ApiError';
import { recognizeImageText } from '../../../helpers/ocr';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { Expense } from '../expense/expense.model';
import { OCRService } from '../ocr/ocr.service';
import { IOcrResult } from './scan.interface';

const parseReceiptDate = (value: string) => {
  const parts = value.split(/[-/.]/).map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;

  if (parts[0] > 999) {
    [year, month, day] = parts;
  } else {
    [day, month, year] = parts;
    if (year < 100) year += year >= 70 ? 1900 : 2000;

    // If day-first is impossible, interpret the value as MM/DD/YYYY.
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const extractLatestReceiptDate = (text: string) => {
  const matches = text.match(
    /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g,
  );

  if (!matches) return null;

  return matches.reduce<Date | null>((latest, match) => {
    const parsed = parseReceiptDate(match);
    if (!parsed || (latest && parsed <= latest)) return latest;
    return parsed;
  }, null);
};

const extractAndCreateExpenseFromImage = async (
  user: JwtPayload,
  file: Express.Multer.File,
) => {
  const rawText = await recognizeImageText(file.buffer, file.mimetype);
  const receipt = await OCRService.analyzeReceipt(rawText);
  const receiptDate = extractLatestReceiptDate(rawText);

  if (receipt.amount === null || receipt.amount <= 0 || !receiptDate) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      'Could not detect a valid amount and date from the receipt',
    );
  }

  const extractedData: IOcrResult = {
    amount: receipt.amount,
    category: receipt.category,
    date: receiptDate.toISOString(),
    description: rawText.replace(/\s+/g, ' ').trim().slice(0, 100),
    fileUrl: null,
    fileName: file.originalname,
  };

  let uploadedKey: string | undefined;

  try {
    const uploadResult = await s3Uploader.uploadBufferToS3(
      file.buffer,
      file.originalname,
      file.mimetype,
      'scan-receipts',
    );
    uploadedKey = uploadResult.key;
    extractedData.fileUrl = uploadResult.url;

    return await Expense.create({
      user: user.id,
      amount: extractedData.amount,
      category: extractedData.category,
      date: receiptDate,
      description: extractedData.description,
      fileUrl: extractedData.fileUrl,
      fileKey: uploadResult.key,
      fileName: extractedData.fileName,
    });
  } catch (error) {
    if (uploadedKey) {
      try {
        await s3Uploader.deleteByKey(uploadedKey);
      } catch {
        // Preserve the original upload/database error.
      }
    }
    throw error;
  }
};

const updateExpenseInDB = async (
  user: JwtPayload,
  expenseId: string,
  updatedData: Partial<IOcrResult>,
) => {
  const allowedUpdate: Partial<IOcrResult> = {};
  const allowedFields: Array<keyof IOcrResult> = [
    'amount',
    'category',
    'date',
    'description',
    'fileUrl',
    'fileName',
  ];

  for (const field of allowedFields) {
    if (updatedData[field] !== undefined) {
      Object.assign(allowedUpdate, { [field]: updatedData[field] });
    }
  }

  const expense = await Expense.findOneAndUpdate(
    { _id: expenseId, user: user.id },
    { $set: allowedUpdate },
    { new: true, runValidators: true },
  );

  if (!expense) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'Expense not found or user not authorized',
    );
  }

  return expense;
};

export const ScanService = {
  extractAndCreateExpenseFromImage,
  updateExpenseInDB,
};
