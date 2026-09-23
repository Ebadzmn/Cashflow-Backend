/* eslint-disable prefer-const */
/* eslint-disable no-undef */
import { recognizeImageText } from '../../../helpers/ocr';
import {
  CATEGORY_KEYWORDS,
  EXPENSE_CATEGORIES,
  IOCRResponse,
} from './ocr.interface';

const analyzeReceipt = async (
  input: string | Buffer,
  mimeType?: string,
): Promise<IOCRResponse> => {
  let rawText = '';

  if (typeof input === 'string') {
    rawText = input;
  } else {
    rawText = await recognizeImageText(input, mimeType);
  }

  const amount = extractAmount(rawText);
  const category = detectCategory(rawText);

  return {
    amount,
    category,
  };
};

const extractAmount = (text: string): number | null => {
  // Common total keywords
  const totalKeywords = [
    'total',
    'balance',
    'due',
    'amount',
    'subtotal',
    'grand total',
    'sum',
    'pay',
  ];
  const lines = text.split('\n');

  let potentialAmounts: number[] = [];

  // 1. Look for lines containing total keywords
  for (const line of lines) {
    const lowercaseLine = line.toLowerCase();
    if (totalKeywords.some(keyword => lowercaseLine.includes(keyword))) {
      const match = line.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/);
      if (match) {
        const parsed = parseAmountString(match[1]);
        if (parsed !== null) potentialAmounts.push(parsed);
      }
    }
  }

  if (potentialAmounts.length > 0) {
    return Math.max(...potentialAmounts);
  }

  // 2. Fallback: Find the largest currency-like number in the entire text
  const allAmounts = text.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/g);
  if (allAmounts) {
    const parsedAmounts = allAmounts
      .map(a => parseAmountString(a))
      .filter((a): a is number => a !== null);

    if (parsedAmounts.length > 0) {
      return Math.max(...parsedAmounts);
    }
  }

  return null;
};

const parseAmountString = (amountStr: string): number | null => {
  // 1,060.00 -> 1060.00
  // 1.060,00 -> 1060.00 (European)

  // Count dots and commas
  const dotCount = (amountStr.match(/\./g) || []).length;
  const commaCount = (amountStr.match(/,/g) || []).length;

  let normalized = amountStr;

  if (commaCount > 0 && dotCount > 0) {
    // Both present. Determine which is the decimal separator.
    const lastDotIndex = amountStr.lastIndexOf('.');
    const lastCommaIndex = amountStr.lastIndexOf(',');

    if (lastDotIndex > lastCommaIndex) {
      // Dot is decimal (e.g. 1,060.00). Remove all commas.
      normalized = amountStr.replace(/,/g, '');
    } else {
      // Comma is decimal (e.g. 1.060,00). Remove all dots, replace comma with dot.
      normalized = amountStr.replace(/\./g, '').replace(',', '.');
    }
  } else if (commaCount > 0) {
    // Only commas present.
    const lastCommaIndex = amountStr.lastIndexOf(',');
    if (amountStr.length - lastCommaIndex === 3) {
      // Likely a decimal (e.g. 1060,00). Replace with dot.
      normalized = amountStr.replace(',', '.');
    } else {
      // Likely a thousands separator (e.g. 1,060). Remove it.
      normalized = amountStr.replace(/,/g, '');
    }
  } else if (dotCount > 0) {
    // Only dots present.
    const lastDotIndex = amountStr.lastIndexOf('.');
    if (amountStr.length - lastDotIndex !== 3 && dotCount > 1) {
      // Multiple dots and last one is not at decimal position (e.g. 1.060.000). Remove them.
      normalized = amountStr.replace(/\./g, '');
    }
    // If it's 1060.00, it stays 1060.00.
  }

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
};

const detectCategory = (text: string): string => {
  const lowercaseText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === EXPENSE_CATEGORIES.OTHERS) continue;

    if (keywords.some(keyword => lowercaseText.includes(keyword))) {
      return category;
    }
  }

  return EXPENSE_CATEGORIES.OTHERS;
};

export const OCRService = {
  analyzeReceipt,
};
