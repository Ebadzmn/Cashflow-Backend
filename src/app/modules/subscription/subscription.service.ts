/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'buffer';
import { randomUUID } from 'crypto';
import {
  Environment,
  GetTransactionHistoryVersion,
  JWSTransactionDecodedPayload,
  NotificationHistoryRequest,
  NotificationTypeV2,
  Order,
  ProductType,
  Status,
} from '@apple/app-store-server-library';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import config from '../../../config';
import QueryBuilder from '../../../builder/QueryBuilder';
import ApiError from '../../../errors/ApiError';
import { User } from '../user/user.model';
import {
  getAppleClient,
  getAppleVerifier,
  getTransactionFromApple,
} from './appleClient';
import { AppleNotification } from './appleNotification.model';
import {
  BILLING_CYCLE,
  ISubscription,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
} from './subscription.interface';
import { Subscription } from './subscription.model';
import { SubscriptionOwnership } from './subscriptionOwnership.model';

type ProductMapping = {
  plan: SUBSCRIPTION_PLAN;
  billingCycle: BILLING_CYCLE;
};

const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60_000;

const productMappings = (): Record<string, ProductMapping> => {
  try {
    return JSON.parse(config.apple.productMap || '{}') as Record<
      string,
      ProductMapping
    >;
  } catch {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'APPLE_PRODUCT_MAP must be valid JSON',
    );
  }
};

const mapAppleStatus = (status?: number): SUBSCRIPTION_STATUS => {
  switch (status) {
    case Status.ACTIVE:
      return SUBSCRIPTION_STATUS.ACTIVE;
    case Status.BILLING_RETRY:
      return SUBSCRIPTION_STATUS.BILLING_RETRY;
    case Status.BILLING_GRACE_PERIOD:
      return SUBSCRIPTION_STATUS.GRACE_PERIOD;
    case Status.REVOKED:
      return SUBSCRIPTION_STATUS.REVOKED;
    default:
      return SUBSCRIPTION_STATUS.EXPIRED;
  }
};

const validateTransaction = (
  transaction: JWSTransactionDecodedPayload,
  expectedProductId?: string,
) => {
  if (
    !transaction.transactionId ||
    !transaction.originalTransactionId ||
    !transaction.productId ||
    !transaction.purchaseDate ||
    !transaction.expiresDate ||
    !transaction.environment
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Apple returned incomplete subscription transaction data',
    );
  }
  if (expectedProductId && transaction.productId !== expectedProductId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Product ID does not match');
  }
  const mapping = productMappings()[transaction.productId];
  if (!mapping) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Unsupported Apple product');
  }
  return mapping;
};

const isDuplicateKeyError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 11000,
  );

const claimSubscriptionOwnership = async (
  userId: string | Types.ObjectId,
  originalTransactionId: string,
) => {
  const recordedOwner = await Subscription.findOne({ originalTransactionId })
    .sort({ createdAt: 1 })
    .select('user');
  if (recordedOwner && recordedOwner.user.toString() !== userId.toString()) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This Apple subscription belongs to another account',
    );
  }
  try {
    const ownership = await SubscriptionOwnership.findOneAndUpdate(
      {
        originalTransactionId,
        $or: [{ user: userId }, { user: { $exists: false } }],
      },
      {
        $setOnInsert: { originalTransactionId, user: userId },
      },
      { upsert: true, new: true, runValidators: true },
    );
    if (!ownership || ownership.user.toString() !== userId.toString()) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        'This Apple subscription belongs to another account',
      );
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        'This Apple subscription belongs to another account',
      );
    }
    throw error;
  }
};

const resolveSubscriptionOwner = async (originalTransactionId: string) => {
  const recordedOwnership = await SubscriptionOwnership.findOne({
    originalTransactionId,
  }).select('user');
  if (recordedOwnership) return recordedOwnership.user;

  // Ownership rows were introduced after subscriptions were already in use.
  // Lazily backfill from the earliest trusted transaction for existing users.
  const legacySubscription = await Subscription.findOne({
    originalTransactionId,
  })
    .sort({ createdAt: 1 })
    .select('user');
  if (!legacySubscription) return null;

  await claimSubscriptionOwnership(
    legacySubscription.user,
    originalTransactionId,
  );
  return legacySubscription.user;
};

const synchronizeUserEntitlement = async (userId: string | Types.ObjectId) => {
  const current = await Subscription.findOne({
    user: userId,
    status: {
      $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.GRACE_PERIOD],
    },
    expiryDate: { $gt: new Date() },
  })
    .sort({ expiryDate: -1 })
    .select('plan expiryDate');
  const premium = Boolean(current);
  await User.findByIdAndUpdate(userId, {
    isPremium: premium,
    plan: current?.plan || SUBSCRIPTION_PLAN.FREE,
    expireDate: current?.expiryDate || null,
  });
  return { premium, expiresAt: current?.expiryDate || null };
};

const persistTransaction = async (
  userId: string | Types.ObjectId,
  transaction: JWSTransactionDecodedPayload,
  status?: SUBSCRIPTION_STATUS,
  notificationUUID?: string,
  accessExpiresDate?: number,
  sourceSignedDate?: number,
  synchronize = true,
) => {
  const mapping = validateTransaction(transaction);
  await claimSubscriptionOwnership(userId, transaction.originalTransactionId!);

  const computedStatus =
    status ||
    (transaction.revocationDate
      ? SUBSCRIPTION_STATUS.REVOKED
      : transaction.expiresDate! > Date.now()
        ? SUBSCRIPTION_STATUS.ACTIVE
        : SUBSCRIPTION_STATUS.EXPIRED);
  const effectiveExpiry = new Date(
    Math.max(transaction.expiresDate!, accessExpiresDate || 0),
  );

  const signedAt = new Date(
    sourceSignedDate || transaction.signedDate || transaction.purchaseDate!,
  );
  const update = {
    user: userId,
    plan: mapping.plan,
    billingCycle: mapping.billingCycle,
    originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId,
    environment: transaction.environment,
    startDate: new Date(transaction.purchaseDate!),
    expiryDate: effectiveExpiry,
    revocationDate: transaction.revocationDate
      ? new Date(transaction.revocationDate)
      : undefined,
    status: computedStatus,
    lastNotificationUUID: notificationUUID,
    sourceSignedDate: signedAt,
    lastVerifiedAt: new Date(),
  };

  let subscription = await Subscription.findOneAndUpdate(
    {
      transactionId: transaction.transactionId,
      user: userId,
      $or: [
        { sourceSignedDate: { $exists: false } },
        { sourceSignedDate: { $lte: signedAt } },
      ],
    },
    { $set: update },
    { new: true, runValidators: true },
  );

  if (!subscription) {
    const existing = await Subscription.findOne({
      transactionId: transaction.transactionId,
    });
    if (existing) {
      if (existing.user.toString() !== userId.toString()) {
        throw new ApiError(
          StatusCodes.CONFLICT,
          'This Apple subscription belongs to another account',
        );
      }
      subscription = existing;
    } else {
      try {
        subscription = await Subscription.findOneAndUpdate(
          { transactionId: transaction.transactionId, user: userId },
          { $set: update },
          { upsert: true, new: true, runValidators: true },
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        subscription = await Subscription.findOne({
          transactionId: transaction.transactionId,
          user: userId,
        });
      }
    }
  }
  if (!subscription) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Unable to persist Apple subscription transaction',
    );
  }
  if (synchronize) await synchronizeUserEntitlement(userId);
  return subscription;
};

const verifyPurchase = async (
  userId: string,
  payload: { transactionId: string; productId: string },
) => {
  const apple = await getTransactionFromApple(payload.transactionId);
  if (!apple.signedTransactionInfo) {
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      'Apple returned no transaction',
    );
  }
  const transaction = await getAppleVerifier(
    apple.environment,
  ).verifyAndDecodeTransaction(apple.signedTransactionInfo);
  if (transaction.transactionId !== payload.transactionId) {
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      'Apple returned a different transaction identifier',
    );
  }
  validateTransaction(transaction, payload.productId);
  const subscription = await persistTransaction(userId, transaction);
  const premium =
    subscription.status === SUBSCRIPTION_STATUS.ACTIVE &&
    subscription.expiryDate > new Date();
  if (!premium) {
    // A delayed verification may contain an earlier sandbox/renewal
    // transaction. Refresh the subscription group before denying access.
    return getStatus(userId, true);
  }
  return { premium, expiresAt: subscription.expiryDate };
};

async function getStatus(userId: string, forceRefresh = false) {
  const stored = await Subscription.findOne({ user: userId })
    .sort({ expiryDate: -1 })
    .select(
      'originalTransactionId environment expiryDate status lastVerifiedAt',
    );
  if (!stored) return { premium: false, expiresAt: null };

  const configuredCacheMs = Number(config.apple.statusCacheMs);
  const statusCacheMs =
    Number.isFinite(configuredCacheMs) && configuredCacheMs >= 0
      ? Math.min(configuredCacheMs, 5 * 60_000)
      : 60_000;
  if (
    !forceRefresh &&
    stored.lastVerifiedAt &&
    stored.lastVerifiedAt.getTime() > Date.now() - statusCacheMs
  ) {
    return {
      premium:
        [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.GRACE_PERIOD].includes(
          stored.status,
        ) && stored.expiryDate > new Date(),
      expiresAt: stored.expiryDate,
    };
  }

  const environment = stored.environment as Environment;
  const response = await getAppleClient(environment).getAllSubscriptionStatuses(
    stored.originalTransactionId,
  );
  const items = (response.data || []).flatMap(
    item => item.lastTransactions || [],
  );
  const decoded = await Promise.all(
    items
      .filter(item => item.signedTransactionInfo)
      .map(async item => {
        const verifier = getAppleVerifier(environment);
        return {
          status: item.status,
          transaction: await verifier.verifyAndDecodeTransaction(
            item.signedTransactionInfo!,
          ),
          renewal: item.signedRenewalInfo
            ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
            : undefined,
        };
      }),
  );
  const latest = decoded.sort(
    (a, b) =>
      (b.transaction.expiresDate || 0) - (a.transaction.expiresDate || 0),
  )[0];
  if (!latest) {
    await User.findByIdAndUpdate(userId, {
      isPremium: false,
      plan: SUBSCRIPTION_PLAN.FREE,
      expireDate: null,
    });
    return { premium: false, expiresAt: null };
  }
  const subscription = await persistTransaction(
    userId,
    latest.transaction,
    mapAppleStatus(latest.status),
    undefined,
    latest.renewal?.gracePeriodExpiresDate,
  );
  const premium =
    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.GRACE_PERIOD].includes(
      subscription.status,
    ) && subscription.expiryDate > new Date();
  return { premium, expiresAt: subscription.expiryDate };
}

const fetchHistory = async (
  originalTransactionId: string,
  environment: Environment,
) => {
  const client = getAppleClient(environment);
  const verifier = getAppleVerifier(environment);
  let revision: string | null = null;
  let hasMore = false;
  const transactions: JWSTransactionDecodedPayload[] = [];
  const seenRevisions = new Set<string>();
  let pages = 0;
  do {
    if (++pages > 100) {
      throw new ApiError(
        StatusCodes.BAD_GATEWAY,
        'Apple returned an unexpectedly large transaction history',
      );
    }
    const response = await client.getTransactionHistory(
      originalTransactionId,
      revision,
      { sort: Order.ASCENDING, productTypes: [ProductType.AUTO_RENEWABLE] },
      GetTransactionHistoryVersion.V2,
    );
    for (const signed of response.signedTransactions || []) {
      transactions.push(await verifier.verifyAndDecodeTransaction(signed));
    }
    const nextRevision = response.revision || null;
    if (nextRevision && seenRevisions.has(nextRevision)) {
      throw new ApiError(
        StatusCodes.BAD_GATEWAY,
        'Apple returned a repeated transaction history revision',
      );
    }
    if (nextRevision) seenRevisions.add(nextRevision);
    revision = nextRevision;
    hasMore = response.hasMore === true;
  } while (hasMore);
  return transactions;
};

const restorePurchase = async (
  userId: string,
  originalTransactionId: string,
) => {
  const apple = await getTransactionFromApple(originalTransactionId);
  const environment = apple.environment;
  const transactions = await fetchHistory(originalTransactionId, environment);
  if (!transactions.length) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      'No Apple purchase history found',
    );
  }
  for (const transaction of transactions) {
    await persistTransaction(
      userId,
      transaction,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    );
  }
  await synchronizeUserEntitlement(userId);
  return getStatus(userId);
};

const getAppleHistory = async (userId: string) => {
  const subscription = await Subscription.findOne({ user: userId }).sort({
    expiryDate: -1,
  });
  if (!subscription) return [];
  const transactions = await fetchHistory(
    subscription.originalTransactionId,
    subscription.environment as Environment,
  );
  for (const transaction of transactions) {
    await persistTransaction(
      userId,
      transaction,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    );
  }
  await synchronizeUserEntitlement(userId);
  return transactions.map(transaction => ({
    purchaseDate: transaction.purchaseDate
      ? new Date(transaction.purchaseDate)
      : null,
    expiresAt: transaction.expiresDate
      ? new Date(transaction.expiresDate)
      : null,
    productId: transaction.productId,
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    environment: transaction.environment,
    revoked: Boolean(transaction.revocationDate),
  }));
};

const processWebhook = async (signedPayload: string) => {
  let unverifiedPayload: { data?: { environment?: Environment } };
  try {
    unverifiedPayload = JSON.parse(
      Buffer.from(signedPayload.split('.')[1] || '', 'base64url').toString(),
    ) as { data?: { environment?: Environment } };
  } catch {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Malformed Apple signed payload',
    );
  }
  const environment = unverifiedPayload.data?.environment;
  if (![Environment.PRODUCTION, Environment.SANDBOX].includes(environment!)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Apple environment');
  }
  const verifier = getAppleVerifier(environment!);
  const notification =
    await verifier.verifyAndDecodeNotification(signedPayload);
  if (!notification.notificationUUID) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing notification UUID');
  }
  const signedTransaction = notification.data?.signedTransactionInfo;
  const transaction = signedTransaction
    ? await verifier.verifyAndDecodeTransaction(signedTransaction)
    : undefined;
  const renewal = notification.data?.signedRenewalInfo
    ? await verifier.verifyAndDecodeRenewalInfo(
        notification.data.signedRenewalInfo,
      )
    : undefined;

  const processingToken = randomUUID();
  const processingStartedAt = new Date();
  const expiredLeaseThreshold = new Date(
    processingStartedAt.getTime() - WEBHOOK_PROCESSING_LEASE_MS,
  );

  try {
    await AppleNotification.findOneAndUpdate(
      {
        notificationUUID: notification.notificationUUID,
        processedAt: null,
        $or: [
          { processingStartedAt: { $exists: false } },
          { processingStartedAt: null },
          { processingStartedAt: { $lte: expiredLeaseThreshold } },
        ],
      },
      {
        $setOnInsert: {
          notificationUUID: notification.notificationUUID,
          notificationType: notification.notificationType,
          subtype: notification.subtype,
          signedDate: notification.signedDate
            ? new Date(notification.signedDate)
            : undefined,
          transactionId: transaction?.transactionId,
          originalTransactionId: transaction?.originalTransactionId,
          processedAt: null,
        },
        $set: { processingStartedAt, processingToken },
      },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await AppleNotification.findOne({
        notificationUUID: notification.notificationUUID,
      }).select('processedAt');
      if (existing?.processedAt) return { duplicate: true };
      throw new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Apple notification is already being processed',
      );
    }
    throw error;
  }

  try {
    if (transaction?.originalTransactionId) {
      const owner = await resolveSubscriptionOwner(
        transaction.originalTransactionId,
      );
      if (owner) {
        let status = mapAppleStatus(notification.data?.status);
        if (notification.notificationType === NotificationTypeV2.REFUND) {
          status = SUBSCRIPTION_STATUS.REFUNDED;
        } else if (
          notification.notificationType === NotificationTypeV2.REVOKE
        ) {
          status = SUBSCRIPTION_STATUS.REVOKED;
        } else if (
          notification.notificationType ===
          NotificationTypeV2.GRACE_PERIOD_EXPIRED
        ) {
          status = SUBSCRIPTION_STATUS.EXPIRED;
        }
        await persistTransaction(
          owner,
          transaction,
          status,
          notification.notificationUUID,
          renewal?.gracePeriodExpiresDate,
          notification.signedDate,
        );
      }
    }
    const completion = await AppleNotification.updateOne(
      {
        notificationUUID: notification.notificationUUID,
        processingToken,
        processedAt: null,
      },
      {
        $set: { processedAt: new Date(), processingStartedAt: null },
        $unset: { processingToken: 1 },
      },
    );
    if (!completion.matchedCount) {
      throw new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Apple notification processing lease was lost',
      );
    }
    return { duplicate: false };
  } catch (error) {
    // Release only this worker's lease so Apple can safely retry immediately.
    await AppleNotification.updateOne(
      {
        notificationUUID: notification.notificationUUID,
        processingToken,
        processedAt: null,
      },
      {
        $set: { processingStartedAt: null },
        $unset: { processingToken: 1 },
      },
    ).catch(() => undefined);
    throw error;
  }
};

const requestNotificationTest = (environment: Environment) =>
  getAppleClient(environment).requestTestNotification();

const getNotificationHistory = (
  environment: Environment,
  request: NotificationHistoryRequest,
  paginationToken: string | null,
) =>
  getAppleClient(environment).getNotificationHistory(paginationToken, request);

const getNotificationDetails = (notificationUUID: string) =>
  AppleNotification.findOne({ notificationUUID });

const getSubscriptionHistoryFromDB = async (
  userId: string,
  query: Record<string, any>,
): Promise<{ pagination: any; result: ISubscription[] }> => {
  const subscriptionQuery = new QueryBuilder(
    Subscription.find({ user: userId }),
    query,
  )
    .filter(['status', 'plan', 'billingCycle', 'productId', 'environment'])
    .sort(['createdAt', 'startDate', 'expiryDate'])
    .paginate();
  return {
    result: await subscriptionQuery.modelQuery,
    pagination: await subscriptionQuery.pagination(),
  };
};

export const SubscriptionService = {
  verifyPurchase,
  getStatus,
  restorePurchase,
  getAppleHistory,
  processWebhook,
  requestNotificationTest,
  getNotificationHistory,
  getNotificationDetails,
  getSubscriptionHistoryFromDB,
};
