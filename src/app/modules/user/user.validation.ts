import { z } from 'zod';

const createUserZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name is required' }).trim().min(1),
    contact: z.string({ required_error: 'Contact is required' }).trim().min(1),
    email: z.string({ required_error: 'Email is required' }).trim().email(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8)
      .max(128),
  }),
});

const updateUserZodSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    contact: z.string().trim().min(1).optional(),
    location: z.string().trim().max(200).optional(),
  })
  .strict();

const updateUserStatusZodSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'block']),
  }),
});

export const UserValidation = {
  createUserZodSchema,
  updateUserZodSchema,
  updateUserStatusZodSchema,
};
