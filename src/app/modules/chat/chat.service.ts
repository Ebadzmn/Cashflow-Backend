/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-undef */
import { JwtPayload } from 'jsonwebtoken';
import { User } from '../user/user.model';
import { ChatRoom } from './chatRoom.model';
import { USER_ROLES } from '../../../enums/user';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';
import { ChatMessage } from './chatMessage.model';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { compressImage, compressPdf } from '../../../helpers/fileProcessor';
import { imageMimeTypes, ocrImageExtension } from '../../../helpers/multer';
import QueryBuilder from '../../../builder/QueryBuilder';
import mongoose from 'mongoose';
import { errorLogger } from '../../../shared/logger';

const isUnsupportedTransactionError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  const codeName = 'codeName' in error ? error.codeName : undefined;
  const message = 'message' in error ? String(error.message) : '';

  return (
    (code === 20 || codeName === 'IllegalOperation') &&
    /transaction/i.test(message) &&
    /(replica set|mongos|not supported|only allowed)/i.test(message)
  );
};

const createChatRoom = async (user: JwtPayload) => {
  const userId = user.id;

  // Check if a chat room already exists for this user
  const existingChatRoom = await ChatRoom.findOne({ user: userId });
  if (existingChatRoom) {
    return existingChatRoom;
  }

  // Find an admin to assign to the chat room
  const adminUser = await User.findOne({
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN] },
  });

  if (!adminUser) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No admin available to assign to chat room',
    );
  }

  const newChatRoom = await ChatRoom.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        participants: [userId, adminUser._id],
        admin: adminUser._id,
        user: userId,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  if (globalThis.io) {
    // Notify both user and admin about the new chat room
    globalThis.io
      .to(userId)
      .to(adminUser._id.toString())
      .emit('chatRoomCreated', newChatRoom);
  }

  return newChatRoom;
};

const sendMessage = async (
  sender: JwtPayload,
  chatRoomId: string,
  messagePayload: {
    messageType: 'text' | 'image' | 'pdf';
    content?: string;
    file?: Express.Multer.File;
  },
) => {
  const { messageType, content, file } = messagePayload;
  const senderId = sender.id;
  const senderRole = sender.role;

  if (!['text', 'image', 'pdf'].includes(messageType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid message type');
  }
  let textContent: string | undefined;
  if (messageType === 'text') {
    if (!content || !content.trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Text content is required');
    }
    textContent = content.trim();
  }
  if (content && content.length > 5000) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Message is too long');
  }
  if (messageType !== 'text' && !file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Attachment is required');
  }
  if (file) {
    if (file.size > 5 * 1024 * 1024 || file.buffer.length > 5 * 1024 * 1024) {
      throw new ApiError(
        httpStatus.REQUEST_ENTITY_TOO_LARGE,
        'Attachment is too large',
      );
    }
    const normalizedMime = (file.mimetype || '').toLowerCase();
    const validMime =
      (messageType === 'image' &&
        (imageMimeTypes.has(normalizedMime) ||
          ocrImageExtension.test(file.originalname))) ||
      (messageType === 'pdf' &&
        (normalizedMime === 'application/pdf' ||
          /\.pdf$/i.test(file.originalname)));
    if (!validMime) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Attachment type does not match message type',
      );
    }
  }

  const chatRoom = await ChatRoom.findById(chatRoomId);

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chat room not found');
  }

  // Ensure sender is a participant of the chat room
  if (!chatRoom.participants.some(id => id.toString() === senderId)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this chat room',
    );
  }

  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: number | undefined;
  let fileKey: string | undefined;

  if (file) {
    let processedBuffer = file.buffer;

    // Compress file based on type
    if (file.mimetype.startsWith('image/')) {
      processedBuffer = await compressImage(file.buffer);
    } else if (file.mimetype === 'application/pdf') {
      processedBuffer = await compressPdf(file.buffer);
    }

    // Upload to S3
    const uploadResult = await s3Uploader.uploadBufferToS3(
      processedBuffer,
      file.originalname,
      file.mimetype,
      'chat-attachments',
    );

    if (!uploadResult || !uploadResult.url) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to upload attachment to S3',
      );
    }

    fileUrl = uploadResult.url;
    fileKey = uploadResult.key;
    fileName = file.originalname;
    fileSize = processedBuffer.length; // Size of the compressed file
  }

  let newMessageId: mongoose.Types.ObjectId | undefined;
  let session: mongoose.ClientSession | undefined;
  const messageData = {
    chatRoom: chatRoomId,
    sender: senderId,
    senderRole,
    messageType,
    content: textContent,
    fileUrl,
    fileKey,
    fileName,
    fileSize,
    readBy: [senderId],
  };

  const persistWithoutTransaction = async () => {
    const [newMessage] = await ChatMessage.create([messageData]);
    try {
      const roomUpdate = await ChatRoom.updateOne(
        { _id: chatRoomId, participants: senderId },
        { $set: { lastMessage: newMessage._id } },
      );
      if (!roomUpdate.matchedCount) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Chat room access changed');
      }
      return newMessage._id;
    } catch (error) {
      await ChatMessage.deleteOne({ _id: newMessage._id }).catch(
        cleanupError => {
          errorLogger.error(
            'Failed to roll back chat message after room update failure',
            cleanupError,
          );
        },
      );
      throw error;
    }
  };

  try {
    session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [newMessage] = await ChatMessage.create([messageData], {
          session,
        });
        newMessageId = newMessage._id;
        const roomUpdate = await ChatRoom.updateOne(
          { _id: chatRoomId, participants: senderId },
          { $set: { lastMessage: newMessage._id } },
          { session },
        );
        if (!roomUpdate.matchedCount) {
          throw new ApiError(httpStatus.FORBIDDEN, 'Chat room access changed');
        }
      });
    } catch (error) {
      if (!isUnsupportedTransactionError(error)) throw error;
      newMessageId = await persistWithoutTransaction();
    }
  } catch (error) {
    if (fileKey) {
      await s3Uploader.deleteByKey(fileKey).catch(cleanupError => {
        errorLogger.error('Failed to roll back chat attachment', cleanupError);
      });
    }
    throw error;
  } finally {
    await session?.endSession().catch(cleanupError => {
      errorLogger.error('Failed to close chat database session', cleanupError);
    });
  }

  if (!newMessageId) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Message was not saved',
    );
  }

  // Populate sender info for the new message to match getChatMessages response
  const populatedMessage = await ChatMessage.findById(newMessageId).populate(
    'sender',
    'name image avatar',
  );

  if (globalThis.io) {
    globalThis.io.to(chatRoomId).emit('newMessage', populatedMessage);
  }

  return populatedMessage;
};

const getChatMessages = async (
  user: JwtPayload,
  chatRoomId: string,
  query: Record<string, any>,
) => {
  const chatRoom = await ChatRoom.findById(chatRoomId);

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chat room not found');
  }

  // Ensure user is a participant of the chat room
  if (!chatRoom.participants.some(id => id.toString() === user.id)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this chat room',
    );
  }

  const messageQuery = new QueryBuilder(
    ChatMessage.find({ chatRoom: chatRoomId }).populate(
      'sender',
      'name image avatar',
    ),
    query,
  )
    .filter(['messageType', 'senderRole'])
    .sort(['createdAt'])
    .paginate();

  const result = await messageQuery.modelQuery;
  const pagination = await messageQuery.pagination();

  return { result, pagination };
};

const markMessagesAsRead = async (user: JwtPayload, chatRoomId: string) => {
  const userId = user.id;

  const chatRoom = await ChatRoom.findById(chatRoomId);

  if (!chatRoom) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Chat room not found');
  }

  // Ensure user is a participant of the chat room
  if (!chatRoom.participants.some(id => id.toString() === userId)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not a participant of this chat room',
    );
  }

  // Update messages to mark them as read by the user
  await ChatMessage.updateMany(
    {
      chatRoom: chatRoomId,
      sender: { $ne: userId }, // Don't mark messages sent by the user themselves
      readBy: { $ne: userId }, // Only update if not already read by this user
    },
    {
      $addToSet: { readBy: userId }, // Add user to readBy array
    },
  );

  if (globalThis.io) {
    globalThis.io.to(chatRoomId).emit('messagesRead', { chatRoomId, userId });
  }

  return {
    message: 'Messages marked as read successfully',
  };
};

const getMyChatRooms = async (user: JwtPayload, query: Record<string, any>) => {
  const userId = user.id;
  const role = user.role;

  let filter: Record<string, any> = { participants: userId };

  if (role === USER_ROLES.USER) {
    filter = { user: userId };
  }

  const chatRoomQuery = new QueryBuilder(
    ChatRoom.find(filter)
      .populate('user', 'name image avatar')
      .populate('admin', 'name image avatar')
      .populate('lastMessage'),
    query,
  )
    .filter()
    .sort(['createdAt'])
    .paginate();

  const result = await chatRoomQuery.modelQuery;
  const pagination = await chatRoomQuery.pagination();

  return { result, pagination };
};

export const ChatService = {
  createChatRoom,
  sendMessage,
  getChatMessages,
  markMessagesAsRead,
  getMyChatRooms,
};
