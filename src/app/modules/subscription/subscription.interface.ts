/* eslint-disable no-unused-vars */
import { Types } from 'mongoose';

export enum SUBSCRIPTION_PLAN {
  FREE = 'Free',
  BASIC_GROWTH = 'Basic-Growth',
  PRO_PROFESSIONAL = 'Pro-Professional',
  ELITE_POWER_USER = 'Elite-Power User',
  SHIELD_AUDIT_DEFENSE = 'CashFlowIQ Shield-Audit Defense',
}

export enum SUBSCRIPTION_STATUS {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  REVOKED = 'revoked',
  BILLING_RETRY = 'billing_retry',
  GRACE_PERIOD = 'grace_period',
}

export enum PLATFORM {
  IOS = 'ios',
  ANDROID = 'android',
}

export enum BILLING_CYCLE {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export type ISubscription = {
  user: Types.ObjectId;
  plan: SUBSCRIPTION_PLAN;
  billingCycle: BILLING_CYCLE;
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  environment: 'Sandbox' | 'Production';
  startDate: Date;
  expiryDate: Date;
  revocationDate?: Date;
  lastNotificationUUID?: string;
  sourceSignedDate?: Date;
  lastVerifiedAt?: Date;
  status: SUBSCRIPTION_STATUS;
};
