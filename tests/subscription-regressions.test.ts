import {
  Environment,
  NotificationTypeV2,
  Status,
} from '@apple/app-store-server-library';
import config from '../src/config';
import { User } from '../src/app/modules/user/user.model';
import { AppleNotification } from '../src/app/modules/subscription/appleNotification.model';
import { Subscription } from '../src/app/modules/subscription/subscription.model';
import { SubscriptionOwnership } from '../src/app/modules/subscription/subscriptionOwnership.model';
import { SubscriptionService } from '../src/app/modules/subscription/subscription.service';
import * as appleClient from '../src/app/modules/subscription/appleClient';
import {
  BILLING_CYCLE,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
} from '../src/app/modules/subscription/subscription.interface';

const productId = 'com.proProfessional.month';

const queryWithSortAndSelect = (value: unknown) => ({
  sort: jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue(value),
  }),
});

const queryWithSelect = (value: unknown) => ({
  select: jest.fn().mockResolvedValue(value),
});

const signedWebhookPayload = () =>
  `header.${Buffer.from(
    JSON.stringify({ data: { environment: Environment.SANDBOX } }),
  ).toString('base64url')}.signature`;

describe('Apple subscription regression coverage', () => {
  beforeEach(() => {
    config.apple.productMap = JSON.stringify({
      [productId]: {
        plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
        billingCycle: BILLING_CYCLE.MONTHLY,
      },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('forces an Apple status refresh after verifying an older transaction', async () => {
    const now = Date.now();
    const expiryDate = new Date(now - 60_000);
    const transaction = {
      transactionId: 'old-transaction',
      originalTransactionId: 'apple-original',
      productId,
      purchaseDate: now - 86_400_000,
      expiresDate: expiryDate.getTime(),
      signedDate: now - 60_000,
      environment: Environment.SANDBOX,
    };

    jest.spyOn(appleClient, 'getTransactionFromApple').mockResolvedValue({
      environment: Environment.SANDBOX,
      signedTransactionInfo: 'signed-old-transaction',
    });
    jest.spyOn(appleClient, 'getAppleVerifier').mockReturnValue({
      verifyAndDecodeTransaction: jest.fn().mockResolvedValue(transaction),
    } as never);
    const getAllSubscriptionStatuses = jest
      .fn()
      .mockResolvedValue({ data: [] });
    jest.spyOn(appleClient, 'getAppleClient').mockReturnValue({
      getAllSubscriptionStatuses,
    } as never);

    jest
      .spyOn(Subscription, 'findOne')
      .mockReturnValueOnce(queryWithSortAndSelect(null) as never)
      .mockReturnValueOnce(queryWithSortAndSelect(null) as never)
      .mockReturnValueOnce(
        queryWithSortAndSelect({
          originalTransactionId: 'apple-original',
          environment: Environment.SANDBOX,
          expiryDate,
          status: SUBSCRIPTION_STATUS.EXPIRED,
          lastVerifiedAt: new Date(),
        }) as never,
      );
    jest
      .spyOn(SubscriptionOwnership, 'findOneAndUpdate')
      .mockResolvedValue({ user: 'user-1' } as never);
    jest.spyOn(Subscription, 'findOneAndUpdate').mockResolvedValue({
      status: SUBSCRIPTION_STATUS.EXPIRED,
      expiryDate,
    } as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);

    await expect(
      SubscriptionService.verifyPurchase('user-1', {
        transactionId: 'old-transaction',
        productId,
      }),
    ).resolves.toEqual({ premium: false, expiresAt: null });

    expect(getAllSubscriptionStatuses).toHaveBeenCalledWith('apple-original');
  });

  it('lazily backfills a legacy owner and completes the webhook lease', async () => {
    const now = Date.now();
    const expiryDate = new Date(now + 86_400_000);
    const transaction = {
      transactionId: 'renewal-transaction',
      originalTransactionId: 'legacy-original',
      productId,
      purchaseDate: now - 1000,
      expiresDate: expiryDate.getTime(),
      signedDate: now,
      environment: Environment.SANDBOX,
    };
    const verifier = {
      verifyAndDecodeNotification: jest.fn().mockResolvedValue({
        notificationUUID: 'notification-1',
        notificationType: NotificationTypeV2.DID_RENEW,
        signedDate: now,
        data: {
          status: Status.ACTIVE,
          signedTransactionInfo: 'signed-renewal',
        },
      }),
      verifyAndDecodeTransaction: jest.fn().mockResolvedValue(transaction),
    };
    jest
      .spyOn(appleClient, 'getAppleVerifier')
      .mockReturnValue(verifier as never);

    const reserveNotification = jest
      .spyOn(AppleNotification, 'findOneAndUpdate')
      .mockResolvedValue({ notificationUUID: 'notification-1' } as never);
    const completeNotification = jest
      .spyOn(AppleNotification, 'updateOne')
      .mockResolvedValue({ matchedCount: 1 } as never);
    jest
      .spyOn(SubscriptionOwnership, 'findOne')
      .mockReturnValue(queryWithSelect(null) as never);
    const claimOwnership = jest
      .spyOn(SubscriptionOwnership, 'findOneAndUpdate')
      .mockResolvedValue({ user: 'legacy-user' } as never);
    jest
      .spyOn(Subscription, 'findOne')
      .mockReturnValueOnce(
        queryWithSortAndSelect({ user: 'legacy-user' }) as never,
      )
      .mockReturnValueOnce(
        queryWithSortAndSelect({ user: 'legacy-user' }) as never,
      )
      .mockReturnValueOnce(
        queryWithSortAndSelect({ user: 'legacy-user' }) as never,
      )
      .mockReturnValueOnce(
        queryWithSortAndSelect({
          plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
          expiryDate,
        }) as never,
      );
    const saveSubscription = jest
      .spyOn(Subscription, 'findOneAndUpdate')
      .mockResolvedValue({
        status: SUBSCRIPTION_STATUS.ACTIVE,
        expiryDate,
      } as never);
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);

    await expect(
      SubscriptionService.processWebhook(signedWebhookPayload()),
    ).resolves.toEqual({ duplicate: false });

    expect(reserveNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationUUID: 'notification-1',
        processedAt: null,
        $or: expect.arrayContaining([
          { processingStartedAt: { $exists: false } },
          { processingStartedAt: null },
          { processingStartedAt: { $lte: expect.any(Date) } },
        ]),
      }),
      expect.objectContaining({
        $set: {
          processingStartedAt: expect.any(Date),
          processingToken: expect.any(String),
        },
      }),
      { upsert: true, new: true, runValidators: true },
    );
    expect(claimOwnership).toHaveBeenCalledWith(
      expect.objectContaining({ originalTransactionId: 'legacy-original' }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ user: 'legacy-user' }),
      }),
      { upsert: true, new: true, runValidators: true },
    );
    expect(saveSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'renewal-transaction',
        user: 'legacy-user',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          originalTransactionId: 'legacy-original',
          status: SUBSCRIPTION_STATUS.ACTIVE,
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(completeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationUUID: 'notification-1',
        processingToken: expect.any(String),
        processedAt: null,
      }),
      {
        $set: { processedAt: expect.any(Date), processingStartedAt: null },
        $unset: { processingToken: 1 },
      },
    );
  });

  it('returns a retryable error while another webhook lease is active', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), {
      code: 11000,
    });
    jest.spyOn(appleClient, 'getAppleVerifier').mockReturnValue({
      verifyAndDecodeNotification: jest.fn().mockResolvedValue({
        notificationUUID: 'notification-in-flight',
        notificationType: NotificationTypeV2.TEST,
        data: {},
      }),
    } as never);
    jest
      .spyOn(AppleNotification, 'findOneAndUpdate')
      .mockRejectedValue(duplicateError);
    jest
      .spyOn(AppleNotification, 'findOne')
      .mockReturnValue(queryWithSelect({ processedAt: null }) as never);

    await expect(
      SubscriptionService.processWebhook(signedWebhookPayload()),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('acknowledges a webhook UUID that already completed', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), {
      code: 11000,
    });
    jest.spyOn(appleClient, 'getAppleVerifier').mockReturnValue({
      verifyAndDecodeNotification: jest.fn().mockResolvedValue({
        notificationUUID: 'notification-complete',
        notificationType: NotificationTypeV2.TEST,
        data: {},
      }),
    } as never);
    jest
      .spyOn(AppleNotification, 'findOneAndUpdate')
      .mockRejectedValue(duplicateError);
    jest
      .spyOn(AppleNotification, 'findOne')
      .mockReturnValue(queryWithSelect({ processedAt: new Date() }) as never);

    await expect(
      SubscriptionService.processWebhook(signedWebhookPayload()),
    ).resolves.toEqual({ duplicate: true });
  });
});
