import { Schema, model } from 'mongoose';
import { IChatMessage } from './chat.interface';
import { USER_ROLES } from '../../../enums/user';

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    chatRoom: {
      type: Schema.Types.ObjectId,
      ref: 'ChatRoom',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER],
      required: true,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'pdf'],
      required: true,
    },
    content: {
      type: String,
    },
    fileUrl: {
      type: String,
    },
    fileKey: {
      type: String,
    },
    fileName: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  },
);

ChatMessageSchema.index({ chatRoom: 1, createdAt: -1 });
ChatMessageSchema.index({ sender: 1, createdAt: -1 });

export const ChatMessage = model<IChatMessage>(
  'ChatMessage',
  ChatMessageSchema,
);
