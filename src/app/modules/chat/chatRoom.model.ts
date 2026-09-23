import { Schema, model } from 'mongoose';
import { IChatRoom } from './chat.interface';

const ChatRoomSchema = new Schema<IChatRoom>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  },
);

ChatRoomSchema.index({ user: 1 }, { unique: true });
ChatRoomSchema.index({ participants: 1, createdAt: -1 });

export const ChatRoom = model<IChatRoom>('ChatRoom', ChatRoomSchema);
