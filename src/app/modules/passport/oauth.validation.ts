import { z } from 'zod';

const exchangeCode = z.object({
  body: z.object({
    code: z
      .string({ required_error: 'OAuth code is required' })
      .min(40)
      .max(128),
  }),
});

export const OAuthValidation = { exchangeCode };
