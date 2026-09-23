import mongoose, { AnyBulkWriteOperation, Collection, Types } from 'mongoose';
import { ChatRoom } from '../app/modules/chat/chatRoom.model';
import { OAuthCode } from '../app/modules/passport/oauthCode.model';
import { ResetToken } from '../app/modules/resetToken/resetToken.model';
import { AppleNotification } from '../app/modules/subscription/appleNotification.model';
import { Subscription } from '../app/modules/subscription/subscription.model';
import {
  ISubscriptionOwnership,
  SubscriptionOwnership,
} from '../app/modules/subscription/subscriptionOwnership.model';
import config from '../config';
import { errorLogger, logger } from '../shared/logger';

const ensureTtlIndex = async (collection: Collection, field: string) => {
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 26
    ) {
      return;
    }
    throw error;
  }
  const existing = indexes.find(
    index => Object.keys(index.key).length === 1 && index.key[field] === 1,
  );
  if (existing && existing.expireAfterSeconds !== 0 && existing.name) {
    await collection.dropIndex(existing.name);
  }
};

const assertNoOwnershipConflicts = async () => {
  const conflictingRooms = await ChatRoom.aggregate<{ _id: Types.ObjectId }>([
    { $group: { _id: '$user', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]).allowDiskUse(true);
  if (conflictingRooms.length) {
    throw new Error(
      `Cannot create the unique chat-room index: ${conflictingRooms.length} duplicate user groups were found`,
    );
  }

  const conflictingSubscriptions = await Subscription.aggregate<{
    _id: string;
  }>([
    {
      $match: {
        originalTransactionId: { $type: 'string', $ne: '' },
      },
    },
    {
      $group: {
        _id: '$originalTransactionId',
        users: { $addToSet: '$user' },
      },
    },
    { $match: { 'users.1': { $exists: true } } },
    { $limit: 10 },
  ]).allowDiskUse(true);
  if (conflictingSubscriptions.length) {
    throw new Error(
      `Cannot establish subscription ownership: ${conflictingSubscriptions.length} transaction groups have multiple users`,
    );
  }

  const duplicateOwnership = await SubscriptionOwnership.aggregate<{
    _id: string;
  }>([
    { $group: { _id: '$originalTransactionId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 10 },
  ]).allowDiskUse(true);
  if (duplicateOwnership.length) {
    throw new Error(
      `Cannot create the subscription ownership index: ${duplicateOwnership.length} duplicate transaction groups were found`,
    );
  }

  const mismatchedOwnership = await SubscriptionOwnership.aggregate<{
    _id: Types.ObjectId;
  }>([
    {
      $lookup: {
        from: Subscription.collection.name,
        localField: 'originalTransactionId',
        foreignField: 'originalTransactionId',
        as: 'subscriptions',
      },
    },
    { $match: { 'subscriptions.0': { $exists: true } } },
    {
      $match: {
        $expr: { $not: [{ $in: ['$user', '$subscriptions.user'] }] },
      },
    },
    { $limit: 10 },
  ]).allowDiskUse(true);
  if (mismatchedOwnership.length) {
    throw new Error(
      `Cannot continue: ${mismatchedOwnership.length} stored subscription ownership records conflict with transaction history`,
    );
  }
};

const backfillSubscriptionOwnership = async () => {
  const cursor = Subscription.aggregate<{
    _id: string;
    user: Types.ObjectId;
  }>([
    {
      $match: {
        originalTransactionId: { $type: 'string', $ne: '' },
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$originalTransactionId',
        user: { $first: '$user' },
      },
    },
  ])
    .allowDiskUse(true)
    .cursor();

  let operations: AnyBulkWriteOperation<ISubscriptionOwnership>[] = [];
  for await (const ownership of cursor) {
    operations.push({
      updateOne: {
        filter: { originalTransactionId: ownership._id },
        update: {
          $setOnInsert: {
            originalTransactionId: ownership._id,
            user: ownership.user,
          },
        },
        upsert: true,
      },
    });
    if (operations.length === 500) {
      await SubscriptionOwnership.bulkWrite(operations, {
        ordered: false,
      });
      operations = [];
    }
  }
  if (operations.length) {
    await SubscriptionOwnership.bulkWrite(operations, {
      ordered: false,
    });
  }
};

const prepareProduction = async () => {
  await mongoose.connect(config.database_url, {
    serverSelectionTimeoutMS: Number(
      config.database_server_selection_timeout_ms,
    ),
    autoIndex: false,
  });

  await assertNoOwnershipConflicts();
  await backfillSubscriptionOwnership();
  await ensureTtlIndex(ResetToken.collection, 'expireAt');
  await ensureTtlIndex(OAuthCode.collection, 'expiresAt');

  for (const model of [
    ChatRoom,
    Subscription,
    SubscriptionOwnership,
    AppleNotification,
    ResetToken,
    OAuthCode,
  ]) {
    await model.createIndexes();
  }

  logger.info('Production database preflight completed successfully');
};

prepareProduction()
  .catch(error => {
    errorLogger.error('Production database preflight failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
