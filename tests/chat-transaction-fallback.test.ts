import { JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { USER_ROLES } from '../src/enums/user';
import { ChatService } from '../src/app/modules/chat/chat.service';
import { ChatMessage } from '../src/app/modules/chat/chatMessage.model';
import { ChatRoom } from '../src/app/modules/chat/chatRoom.model';

const senderId = '507f1f77bcf86cd799439011';
const chatRoomId = '507f191e810c19729de860ea';
const messageId = new mongoose.Types.ObjectId();

const sender = {
  id: senderId,
  role: USER_ROLES.USER,
} as JwtPayload;

const unsupportedTransactionError = Object.assign(
  new Error(
    'Transaction numbers are only allowed on a replica set member or mongos',
  ),
  { code: 20, codeName: 'IllegalOperation' },
);

const mockRoom = () =>
  jest.spyOn(ChatRoom, 'findById').mockResolvedValue({
    participants: [{ toString: () => senderId }],
  } as never);

const mockSession = (transactionError: Error) => {
  const session = {
    withTransaction: jest.fn().mockRejectedValue(transactionError),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  return session;
};

describe('chat transaction topology fallback', () => {
  beforeEach(() => {
    globalThis.io = undefined;
  });

  afterEach(() => jest.restoreAllMocks());

  it('persists once without a session when transactions are unsupported', async () => {
    mockRoom();
    const session = mockSession(unsupportedTransactionError);
    const createMessage = jest
      .spyOn(ChatMessage, 'create')
      .mockResolvedValue([{ _id: messageId }] as never);
    const updateRoom = jest
      .spyOn(ChatRoom, 'updateOne')
      .mockResolvedValue({ matchedCount: 1 } as never);
    const deleteMessage = jest
      .spyOn(ChatMessage, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 } as never);
    const populatedMessage = { _id: messageId, content: 'hello' };
    jest.spyOn(ChatMessage, 'findById').mockReturnValue({
      populate: jest.fn().mockResolvedValue(populatedMessage),
    } as never);

    await expect(
      ChatService.sendMessage(sender, chatRoomId, {
        messageType: 'text',
        content: '  hello  ',
      }),
    ).resolves.toEqual(populatedMessage);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith([
      expect.objectContaining({
        chatRoom: chatRoomId,
        sender: senderId,
        content: 'hello',
      }),
    ]);
    expect(updateRoom).toHaveBeenCalledWith(
      { _id: chatRoomId, participants: senderId },
      { $set: { lastMessage: messageId } },
    );
    expect(deleteMessage).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not retry arbitrary transaction failures outside a transaction', async () => {
    mockRoom();
    const session = mockSession(new Error('database unavailable'));
    const createMessage = jest.spyOn(ChatMessage, 'create');

    await expect(
      ChatService.sendMessage(sender, chatRoomId, {
        messageType: 'text',
        content: 'hello',
      }),
    ).rejects.toThrow('database unavailable');

    expect(createMessage).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('removes a fallback message when room access changed', async () => {
    mockRoom();
    mockSession(unsupportedTransactionError);
    jest
      .spyOn(ChatMessage, 'create')
      .mockResolvedValue([{ _id: messageId }] as never);
    jest
      .spyOn(ChatRoom, 'updateOne')
      .mockResolvedValue({ matchedCount: 0 } as never);
    const deleteMessage = jest
      .spyOn(ChatMessage, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 } as never);

    await expect(
      ChatService.sendMessage(sender, chatRoomId, {
        messageType: 'text',
        content: 'hello',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(deleteMessage).toHaveBeenCalledWith({ _id: messageId });
  });
});
