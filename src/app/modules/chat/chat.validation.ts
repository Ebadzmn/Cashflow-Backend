import { z } from 'zod';

const createChatRoomZodSchema = z.object({
  body: z.object({}),
});

const sendMessageZodSchema = z.object({
  body: z.object({
    content: z.string().optional(),
    messageType: z.enum(['text', 'image', 'pdf'], {
      required_error: 'Message type is required',
    }),
  }),
});

export const ChatValidation = {
  createChatRoomZodSchema,
  sendMessageZodSchema,
};
