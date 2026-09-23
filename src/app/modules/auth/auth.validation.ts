import { z } from 'zod';

const createVerifyEmailZodSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }).trim().email(),
    oneTimeCode: z
      .number({ required_error: 'One time code is required' })
      .int()
      .min(100000)
      .max(999999),
  }),
});

const createLoginZodSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }).trim().email(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128),
  }),
});

const createForgetPasswordZodSchema = z.object({
  body: z.object({
    email: z.string({ required_error: 'Email is required' }).trim().email(),
  }),
});

const createResetPasswordZodSchema = z.object({
  body: z.object({
    newPassword: z
      .string({ required_error: 'Password is required' })
      .min(8)
      .max(128),
    confirmPassword: z
      .string({
        required_error: 'Confirm Password is required',
      })
      .min(8)
      .max(128),
  }),
});

const createChangePasswordZodSchema = z.object({
  body: z.object({
    currentPassword: z
      .string({
        required_error: 'Current Password is required',
      })
      .min(1)
      .max(128),
    newPassword: z
      .string({ required_error: 'New Password is required' })
      .min(8)
      .max(128),
    confirmPassword: z
      .string({
        required_error: 'Confirm Password is required',
      })
      .min(8)
      .max(128),
  }),
});

const createRefreshTokenZodSchema = z.object({
  body: z.object({
    refreshToken: z
      .string({
        required_error: 'Refresh token is required',
      })
      .min(1),
  }),
});

export const AuthValidation = {
  createVerifyEmailZodSchema,
  createForgetPasswordZodSchema,
  createLoginZodSchema,
  createResetPasswordZodSchema,
  createChangePasswordZodSchema,
  createRefreshTokenZodSchema,
};
