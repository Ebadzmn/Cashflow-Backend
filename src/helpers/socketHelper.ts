/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
import { Server, Socket } from 'socket.io';
import { errorContext, errorLogger, logger } from '../shared/logger';
import jwt from 'jsonwebtoken';
import config from '../config';
import { ChatRoom } from '../app/modules/chat/chatRoom.model';
// import { ChatMessage } from '../app/modules/chat/chatMessage.model';
import { JwtPayload } from 'jsonwebtoken';
import { ChatService } from '../app/modules/chat/chat.service';
import { User } from '../app/modules/user/user.model';
import ApiError from '../errors/ApiError';

const socket = (io: Server) => {
  io.use(async (socket: Socket, next) => {
    let token =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (token && token.startsWith('Bearer ')) {
      token = token.split(' ')[1];
    }

    if (!token) {
      return next(new Error('Authentication error: Token not provided'));
    }
    try {
      const decoded = jwt.verify(token, config.jwt.jwt_secret as string, {
        algorithms: ['HS256'],
      }) as JwtPayload;
      const currentUser = await User.findById(decoded.id).select(
        'role email status verified',
      );
      if (
        !currentUser ||
        !currentUser.verified ||
        currentUser.status !== 'active'
      ) {
        return next(new Error('Authentication error: Account is not active'));
      }
      socket.data.user = {
        ...decoded,
        id: currentUser._id.toString(),
        role: currentUser.role,
        email: currentUser.email,
      };
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', socket => {
    logger.info('Socket user connected', { userId: socket.data.user.id });
    let eventWindowStartedAt = Date.now();
    let eventCount = 0;
    const acceptsEvent = () => {
      const now = Date.now();
      if (now - eventWindowStartedAt >= config.socket.eventRateLimitWindowMs) {
        eventWindowStartedAt = now;
        eventCount = 0;
      }
      eventCount += 1;
      if (eventCount > config.socket.eventRateLimitMax) {
        socket.emit(
          'rateLimitError',
          'Too many socket events. Try again later.',
        );
        return false;
      }
      return true;
    };
    // Join a personal room for user-specific events
    socket.join(socket.data.user.id);

    socket.on('joinRoom', async (payload: any) => {
      if (!acceptsEvent()) return;
      try {
        const user = socket.data.user;
        let parsedPayload = payload;
        if (typeof payload === 'string') {
          try {
            parsedPayload = JSON.parse(payload);
          } catch (e) {}
        }
        const chatRoomId =
          typeof parsedPayload === 'string'
            ? parsedPayload
            : parsedPayload?.chatRoomId ||
              parsedPayload?.id ||
              parsedPayload?.roomId;

        if (!chatRoomId || typeof chatRoomId !== 'string') {
          socket.emit('roomError', 'Invalid chat room ID format.');
          return;
        }

        const chatRoom = await ChatRoom.findById(chatRoomId);

        if (
          !chatRoom ||
          !chatRoom.participants.some(id => id.toString() === user.id)
        ) {
          socket.emit('roomError', 'You are not authorized to join this room.');
          return;
        }

        socket.join(chatRoomId);
        logger.info('Socket user joined chat room', {
          userId: user.id,
          chatRoomId,
        });
        socket.emit('joinedRoom', chatRoomId);
      } catch (error: any) {
        errorLogger.error('Socket room join failed', errorContext(error));
        socket.emit('roomError', 'Internal server error while joining room.');
      }
    });

    socket.on('sendMessage', async (messagePayload: any) => {
      if (!acceptsEvent()) return;
      const user = socket.data.user;
      try {
        const parsedPayload =
          typeof messagePayload === 'string'
            ? JSON.parse(messagePayload)
            : messagePayload;
        if (!parsedPayload || typeof parsedPayload !== 'object') {
          socket.emit('messageError', 'Invalid message format.');
          return;
        }
        const roomPayload = parsedPayload.chatRoomId;
        const chatRoomId =
          typeof roomPayload === 'string'
            ? roomPayload
            : roomPayload?.chatRoomId ||
              roomPayload?.id ||
              roomPayload?.roomId ||
              roomPayload?.room;
        const { messageType, content, file } = parsedPayload;

        if (!chatRoomId || typeof chatRoomId !== 'string') {
          socket.emit('messageError', 'Invalid chat room ID format.');
          return;
        }

        // Convert file object for ChatService.sendMessage
        let fileForService: Express.Multer.File | undefined;
        if (file) {
          const buffer = Buffer.from(file.buffer);
          if (buffer.length > 5 * 1024 * 1024) {
            socket.emit('messageError', 'Attachment is too large.');
            return;
          }
          fileForService = {
            buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            fieldname: 'file',
            encoding: '7bit',
            size: buffer.length,
            destination: '',
            filename: file.originalname,
            path: '',
            stream: require('stream').Readable.from(buffer),
          };
        }

        // Event emission is now handled by ChatService.sendMessage
        await ChatService.sendMessage(user, chatRoomId, {
          messageType,
          content,
          file: fileForService,
        });
      } catch (error: any) {
        errorLogger.error('Socket message failed', errorContext(error));
        socket.emit(
          'messageError',
          error instanceof ApiError ? error.message : 'Unable to send message',
        );
      }
    });

    socket.on('markMessagesAsRead', async (payload: any) => {
      if (!acceptsEvent()) return;
      try {
        const user = socket.data.user;
        let parsedPayload = payload;
        if (typeof payload === 'string') {
          try {
            parsedPayload = JSON.parse(payload);
          } catch (e) {}
        }
        const chatRoomId =
          typeof parsedPayload === 'string'
            ? parsedPayload
            : parsedPayload?.chatRoomId ||
              parsedPayload?.id ||
              parsedPayload?.roomId;

        if (!chatRoomId || typeof chatRoomId !== 'string') {
          socket.emit('readError', 'Invalid chat room ID format.');
          return;
        }

        // Event emission is now handled by ChatService.markMessagesAsRead
        await ChatService.markMessagesAsRead(user, chatRoomId);
      } catch (error: any) {
        errorLogger.error('Socket read update failed', errorContext(error));
        socket.emit(
          'readError',
          error instanceof ApiError
            ? error.message
            : 'Unable to update message status',
        );
      }
    });

    //disconnect
    socket.on('disconnect', () => {
      logger.info('Socket user disconnected', { userId: socket.data.user.id });
    });
  });
};

export const socketHelper = { socket };
