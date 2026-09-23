import { Environment } from '@apple/app-store-server-library';
import config from '../src/config';
import { User } from '../src/app/modules/user/user.model';
import { Subscription } from '../src/app/modules/subscription/subscription.model';
import { SubscriptionOwnership } from '../src/app/modules/subscription/subscriptionOwnership.model';
import { SubscriptionService } from '../src/app/modules/subscription/subscription.service';
import * as appleClient from '../src/app/modules/subscription/appleClient';
import {
  BILLING_CYCLE,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
} from '../src/app/modules/subscription/subscription.interface';

describe('Apple purchase verification flow', () => {
  afterEach(() => jest.restoreAllMocks());

  it('persists only Apple-verified transaction fields and enables premium', async () => {
    const purchaseDate = Date.now() - 1000;
    const signedDate = purchaseDate + 500;
    const expiresDate = Date.now() + 86_400_000;
    const expiryDate = new Date(expiresDate);

    config.apple.productMap = JSON.stringify({
      'com.proProfessional.month': {
        plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
        billingCycle: BILLING_CYCLE.MONTHLY,
      },
    });
    jest.spyOn(appleClient, 'getTransactionFromApple').mockResolvedValue({
      environment: Environment.SANDBOX,
      signedTransactionInfo: 'signed-by-apple',
    });
    jest.spyOn(appleClient, 'getAppleVerifier').mockReturnValue({
      verifyAndDecodeTransaction: jest.fn().mockResolvedValue({
        transactionId: 'apple-transaction',
        originalTransactionId: 'apple-original',
        productId: 'com.proProfessional.month',
        bundleId: 'com.example.cashflow',
        purchaseDate,
        expiresDate,
        signedDate,
        environment: Environment.SANDBOX,
      }),
    } as never);

    const ownerSelect = jest.fn().mockResolvedValue(null);
    const ownerSort = jest.fn().mockReturnValue({ select: ownerSelect });
    const entitlementSelect = jest.fn().mockResolvedValue({
      plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
      expiryDate,
    });
    const entitlementSort = jest
      .fn()
      .mockReturnValue({ select: entitlementSelect });
    const findSubscription = jest
      .spyOn(Subscription, 'findOne')
      .mockReturnValueOnce({ sort: ownerSort } as never)
      .mockReturnValueOnce({ sort: entitlementSort } as never);
    const claimOwnership = jest
      .spyOn(SubscriptionOwnership, 'findOneAndUpdate')
      .mockResolvedValue({
        originalTransactionId: 'apple-original',
        user: 'user-1',
      } as never);
    const stored = {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      expiryDate,
    };
    const save = jest
      .spyOn(Subscription, 'findOneAndUpdate')
      .mockResolvedValue(stored as never);
    const updateUser = jest
      .spyOn(User, 'findByIdAndUpdate')
      .mockResolvedValue(null);

    const result = await SubscriptionService.verifyPurchase('user-1', {
      transactionId: 'apple-transaction',
      productId: 'com.proProfessional.month',
    });

    expect(result).toEqual({ premium: true, expiresAt: expiryDate });
    expect(findSubscription).toHaveBeenNthCalledWith(1, {
      originalTransactionId: 'apple-original',
    });
    expect(ownerSort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(ownerSelect).toHaveBeenCalledWith('user');
    expect(claimOwnership).toHaveBeenCalledWith(
      {
        originalTransactionId: 'apple-original',
        $or: [{ user: 'user-1' }, { user: { $exists: false } }],
      },
      {
        $setOnInsert: {
          originalTransactionId: 'apple-original',
          user: 'user-1',
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      {
        transactionId: 'apple-transaction',
        user: 'user-1',
        $or: [
          { sourceSignedDate: { $exists: false } },
          { sourceSignedDate: { $lte: new Date(signedDate) } },
        ],
      },
      {
        $set: {
          user: 'user-1',
          plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
          billingCycle: BILLING_CYCLE.MONTHLY,
          originalTransactionId: 'apple-original',
          productId: 'com.proProfessional.month',
          environment: Environment.SANDBOX,
          startDate: new Date(purchaseDate),
          expiryDate,
          revocationDate: undefined,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          lastNotificationUUID: undefined,
          sourceSignedDate: new Date(signedDate),
          lastVerifiedAt: expect.any(Date),
        },
      },
      { new: true, runValidators: true },
    );
    expect(findSubscription).toHaveBeenNthCalledWith(2, {
      user: 'user-1',
      status: {
        $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.GRACE_PERIOD],
      },
      expiryDate: { $gt: expect.any(Date) },
    });
    expect(entitlementSort).toHaveBeenCalledWith({ expiryDate: -1 });
    expect(entitlementSelect).toHaveBeenCalledWith('plan expiryDate');
    expect(updateUser).toHaveBeenCalledWith('user-1', {
      isPremium: true,
      plan: SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
      expireDate: expiryDate,
    });
  });
});
