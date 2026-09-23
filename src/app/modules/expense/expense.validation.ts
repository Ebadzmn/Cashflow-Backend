import { z } from 'zod';

const createExpenseZodSchema = z.object({
  amount: z.number({ required_error: 'Amount is required' }).positive(),
  category: z.string({ required_error: 'Category is required' }).min(1),
  date: z
    .string({ required_error: 'Date is required' })
    .refine(val => !Number.isNaN(Date.parse(val)), {
      message: 'Date must be a valid ISO string',
    }),
  description: z.string().optional(),
});

const updateExpenseZodSchema = z.object({
  amount: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  date: z
    .string()
    .refine(val => !Number.isNaN(Date.parse(val)), {
      message: 'Date must be a valid ISO string',
    })
    .optional(),
  description: z.string().optional(),
});

export const ExpenseValidation = {
  createExpenseZodSchema,
  updateExpenseZodSchema,
};
