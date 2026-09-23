import mongoose, { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiError';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { errorLogger } from '../../../shared/logger';
import { BankTransaction } from '../bankTransaction/bankTransaction.model';
import { ChatMessage } from '../chat/chatMessage.model';
import { ChatRoom } from '../chat/chatRoom.model';
import { Expense } from '../expense/expense.model';
import { Income } from '../income/income.model';
import { ResetToken } from '../resetToken/resetToken.model';
import { Subscription } from '../subscription/subscription.model';
import { SubscriptionOwnership } from '../subscription/subscriptionOwnership.model';
import { User } from './user.model';

type StoredFile = { fileKey?: string | null };

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

export const deleteUserAccountData = async (userId: string) => {
  const user = await User.findById(userId).select('+imageKey');
  if (!user) return null;

  const objectId = new Types.ObjectId(userId);
  const sharedRoom = await ChatRoom.exists({
    participants: objectId,
    user: { $ne: objectId },
  });
  if (sharedRoom) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      "Reassign this account's chat rooms before deleting it",
    );
  }

  const [incomes, expenses, rooms, messages] = await Promise.all([
    Income.find({ user: objectId }).select('fileKey').lean(),
    Expense.find({ user: objectId }).select('fileKey').lean(),
    ChatRoom.find({ user: objectId }).select('_id').lean(),
    ChatMessage.find({ sender: objectId }).select('fileKey').lean(),
  ]);
  const roomIds = rooms.map(room => room._id);
  const roomMessages = roomIds.length
    ? await ChatMessage.find({ chatRoom: { $in: roomIds } })
        .select('fileKey')
        .lean()
    : [];

  const fileKeys = new Set<string>();
  const addFileKey = (item: StoredFile) => {
    if (item.fileKey) fileKeys.add(item.fileKey);
  };
  [...incomes, ...expenses, ...messages, ...roomMessages].forEach(item =>
    addFileKey(item as StoredFile),
  );
  if (user.imageKey) fileKeys.add(user.imageKey);

  const deleteDatabaseRecords = async (session?: mongoose.ClientSession) => {
    const options = session ? { session } : undefined;
    await Subscription.deleteMany({ user: objectId }, options);
    await SubscriptionOwnership.deleteMany({ user: objectId }, options);
    await Income.deleteMany({ user: objectId }, options);
    await Expense.deleteMany({ user: objectId }, options);
    await BankTransaction.deleteMany({ user: objectId }, options);
    await ResetToken.deleteMany({ user: objectId }, options);
    await ChatMessage.deleteMany(
      {
        $or: [
          { sender: objectId },
          ...(roomIds.length ? [{ chatRoom: { $in: roomIds } }] : []),
        ],
      },
      options,
    );
    await ChatRoom.deleteMany({ user: objectId }, options);
    // Delete the user last so a partial standalone cleanup remains retryable.
    await User.deleteOne({ _id: objectId }, options);
  };

  let session: mongoose.ClientSession | undefined;
  try {
    session = await mongoose.startSession();
    try {
      await session.withTransaction(() => deleteDatabaseRecords(session));
    } catch (error) {
      if (!isUnsupportedTransactionError(error)) throw error;
      await deleteDatabaseRecords();
    }
  } finally {
    await session?.endSession().catch(error => {
      errorLogger.error('Failed to close account cleanup session', error);
    });
  }

  const cleanup = await Promise.allSettled(
    [...fileKeys].map(key => s3Uploader.deleteByKey(key)),
  );
  const failedCleanup = cleanup.filter(result => result.status === 'rejected');
  if (failedCleanup.length) {
    errorLogger.error(
      `Failed to delete ${failedCleanup.length} object(s) while cleaning account ${userId}`,
    );
  }

  return user;
};
