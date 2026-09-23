import { Environment } from '@apple/app-store-server-library';
import { z } from 'zod';

const verifyPurchase = z.object({
  body: z.object({
    transactionId: z.string().min(1),
    productId: z.string().min(1),
  }),
});

const restorePurchase = z.object({
  body: z.object({ originalTransactionId: z.string().min(1) }),
});

const webhook = z.object({
  body: z.object({ signedPayload: z.string().min(1) }),
});

const environment = z.enum([Environment.PRODUCTION, Environment.SANDBOX]);

const notificationTest = z.object({
  body: z.object({ environment }).default({
    environment: Environment.SANDBOX,
  }),
});

const notificationHistory = z.object({
  body: z.object({
    environment,
    paginationToken: z.string().optional(),
    startDate: z.number().int().optional(),
    endDate: z.number().int().optional(),
    notificationType: z.string().optional(),
    notificationSubtype: z.string().optional(),
    transactionId: z.string().optional(),
    onlyFailures: z.boolean().optional(),
  }),
});

export const SubscriptionValidation = {
  verifyPurchase,
  restorePurchase,
  webhook,
  notificationTest,
  notificationHistory,
};
