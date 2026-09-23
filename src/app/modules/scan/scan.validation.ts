import { z } from 'zod';

const updateExpenseBodySchema = z.object({
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  date: z
    .string()
    .refine(val => !Number.isNaN(Date.parse(val)), {
      message: 'Date must be a valid ISO string',
    })
    .optional(),
  description: z.string().optional(),
  fileUrl: z.string().url().optional(),
  fileName: z.string().min(1).optional(),
});

const updateExpenseZodSchema = z.object({
  body: updateExpenseBodySchema,
});

export const ScanValidation = {
  updateExpenseZodSchema,
};
