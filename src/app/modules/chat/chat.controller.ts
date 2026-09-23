import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken'; // Import JwtPayload
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { ChatService } from './chat.service';

const createChatRoom = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload; // Authenticated user from JWT payload

  const result = await ChatService.createChatRoom(user);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    message: 'Chat room created successfully',
    data: result,
  });
});

const sendChatMessage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload; // Authenticated user from JWT payload
  const { chatRoomId } = req.params;
  const { messageType, content } = req.body;
  const file = req.file; // Multer will attach the file here

  const result = await ChatService.sendMessage(user, chatRoomId, {
    messageType,
    content,
    file,
  });

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.CREATED,
    message: 'Message sent successfully',
    data: result,
  });
});

const getChatMessages = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { chatRoomId } = req.params;

  const { result, pagination } = await ChatService.getChatMessages(
    user,
    chatRoomId,
    req.query,
  );

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Chat messages retrieved successfully',
    pagination,
    data: result,
  });
});

const markMessagesAsRead = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { chatRoomId } = req.params;

  const result = await ChatService.markMessagesAsRead(user, chatRoomId);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: result.message,
  });
});

const getMyChatRooms = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { result, pagination } = await ChatService.getMyChatRooms(
    user,
    req.query,
  );

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Chat rooms retrieved successfully',
    pagination,
    data: result,
  });
});

export const ChatController = {
  createChatRoom,
  sendChatMessage,
  getChatMessages,
  markMessagesAsRead,
  getMyChatRooms,
};
