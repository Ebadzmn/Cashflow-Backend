import { Types } from 'mongoose';
import { USER_ROLES } from '../../../enums/user';

export type IChatRoom = {
  participants: Types.ObjectId[]; // User and Admin
  admin: Types.ObjectId; // Assigned Admin
  user: Types.ObjectId; // User who created the room
  lastMessage?: Types.ObjectId; // Reference to the last message
  createdAt: Date;
  updatedAt: Date;
};

export type IChatMessage = {
  chatRoom: Types.ObjectId;
  sender: Types.ObjectId; // User or Admin
  senderRole: USER_ROLES;
  messageType: 'text' | 'image' | 'pdf';
  content?: string; // For text messages
  fileUrl?: string; // For image/pdf attachments
  fileKey?: string;
  fileName?: string; // Original file name for attachments
  fileSize?: number; // Size of the file in bytes
  readBy: Types.ObjectId[]; // Users who have read this message
  createdAt: Date;
  updatedAt: Date;
};
