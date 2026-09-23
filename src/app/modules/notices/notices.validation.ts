import { z } from 'zod';

const createNoticeZodSchema = z.object({
  body: z.object({
    type: z.enum(['IRS Notice', 'Case Status']),
  }),
});

export const NoticeValidation = {
  createNoticeZodSchema,
};
