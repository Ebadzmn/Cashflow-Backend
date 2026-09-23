import mongoose from 'mongoose';
import { BankTransaction } from '../src/app/modules/bankTransaction/bankTransaction.model';
import { ChatMessage } from '../src/app/modules/chat/chatMessage.model';
import { ChatRoom } from '../src/app/modules/chat/chatRoom.model';
import { Expense } from '../src/app/modules/expense/expense.model';
import { Income } from '../src/app/modules/income/income.model';
import { ResetToken } from '../src/app/modules/resetToken/resetToken.model';
import { Subscription } from '../src/app/modules/subscription/subscription.model';
import { SubscriptionOwnership } from '../src/app/modules/subscription/subscriptionOwnership.model';
import { deleteUserAccountData } from '../src/app/modules/user/accountCleanup.service';
import { User } from '../src/app/modules/user/user.model';

const userId = '507f1f77bcf86cd799439011';

const selectResult = (value: unknown) => ({
  select: jest.fn().mockResolvedValue(value),
});

const selectLeanResult = (value: unknown) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

describe('account cleanup safety', () => {
  afterEach(() => jest.restoreAllMocks());

  it("refuses to delete an account that still participates in another user's room", async () => {
    jest
      .spyOn(User, 'findById')
      .mockReturnValue(selectResult({ _id: userId }) as never);
    jest
      .spyOn(ChatRoom, 'exists')
      .mockResolvedValue({ _id: 'shared-room' } as never);
    const deleteUser = jest.spyOn(User, 'deleteOne');
    const startSession = jest.spyOn(mongoose, 'startSession');

    await expect(deleteUserAccountData(userId)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(ChatRoom.exists).toHaveBeenCalledWith({
      participants: new mongoose.Types.ObjectId(userId),
      user: { $ne: new mongoose.Types.ObjectId(userId) },
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('falls back safely when the deployment does not support transactions', async () => {
    const user = { _id: userId, imageKey: undefined };
    jest.spyOn(User, 'findById').mockReturnValue(selectResult(user) as never);
    jest.spyOn(ChatRoom, 'exists').mockResolvedValue(null);
    jest.spyOn(Income, 'find').mockReturnValue(selectLeanResult([]) as never);
    jest.spyOn(Expense, 'find').mockReturnValue(selectLeanResult([]) as never);
    jest.spyOn(ChatRoom, 'find').mockReturnValue(selectLeanResult([]) as never);
    jest
      .spyOn(ChatMessage, 'find')
      .mockReturnValue(selectLeanResult([]) as never);

    const unsupportedError = Object.assign(
      new Error(
        'Transaction numbers are only allowed on a replica set member or mongos',
      ),
      { code: 20, codeName: 'IllegalOperation' },
    );
    const session = {
      withTransaction: jest.fn().mockRejectedValue(unsupportedError),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);

    const deleteSubscriptions = jest
      .spyOn(Subscription, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(SubscriptionOwnership, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(Income, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(Expense, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(BankTransaction, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(ResetToken, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    jest
      .spyOn(ChatMessage, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    const deleteRooms = jest
      .spyOn(ChatRoom, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as never);
    const deleteUser = jest
      .spyOn(User, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 } as never);

    await expect(deleteUserAccountData(userId)).resolves.toBe(user);

    const objectId = new mongoose.Types.ObjectId(userId);
    expect(ChatRoom.find).toHaveBeenCalledWith({ user: objectId });
    expect(deleteSubscriptions).toHaveBeenCalledWith(
      { user: objectId },
      undefined,
    );
    expect(deleteRooms).toHaveBeenCalledWith({ user: objectId }, undefined);
    expect(deleteUser).toHaveBeenCalledWith({ _id: objectId }, undefined);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
