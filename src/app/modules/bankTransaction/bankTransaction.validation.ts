import { z } from 'zod';

const createBankTransactionZodSchema = z.object({
  body: z.object({
    amount: z.number({ required_error: 'Amount is required' }),
    bankName: z.string({ required_error: 'Bank name is required' }),
    accountNumberLast4Digits: z.string({
      required_error: 'Account number last 4 digits is required',
    }),
    refId: z.string({ required_error: 'Reference ID is required' }),
    date: z.string({ required_error: 'Date is required' }),
  }),
});

const updateBankTransactionZodSchema = z.object({
  body: z.object({
    amount: z.number().optional(),
    bankName: z.string().optional(),
    accountNumberLast4Digits: z.string().optional(),
    refId: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const BankTransactionValidation = {
  createBankTransactionZodSchema,
  updateBankTransactionZodSchema,
};
