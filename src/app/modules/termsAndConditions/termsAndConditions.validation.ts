import { z } from 'zod';

const createTermsAndConditionsZodSchema = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
      })
      .min(1, 'Title cannot be empty'),
    description: z
      .string({
        required_error: 'Description is required',
      })
      .min(1, 'Description cannot be empty'),
  }),
});

const updateTermsAndConditionsZodSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    description: z.string().min(1, 'Description cannot be empty').optional(),
  }),
});

export const TermsAndConditionsValidation = {
  createTermsAndConditionsZodSchema,
  updateTermsAndConditionsZodSchema,
};
