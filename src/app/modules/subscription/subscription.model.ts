import { Schema, model } from 'mongoose';
import {
  BILLING_CYCLE,
  ISubscription,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
} from './subscription.interface';

const subscriptionSchema = new Schema<ISubscription>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLAN),
      required: true,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BILLING_CYCLE),
      required: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true, // Prevent duplicate transactions
      index: true,
    },
    originalTransactionId: {
      type: String,
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
    },
    environment: {
      type: String,
      enum: ['Sandbox', 'Production'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    revocationDate: Date,
    lastNotificationUUID: String,
    sourceSignedDate: Date,
    lastVerifiedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

subscriptionSchema.index({ user: 1, expiryDate: -1 });
subscriptionSchema.index({ originalTransactionId: 1, user: 1 });

// Virtual to check if subscription is currently valid based on expiry date
subscriptionSchema.virtual('isValid').get(function () {
  return (
    [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.GRACE_PERIOD].includes(
      this.status,
    ) && this.expiryDate > new Date()
  );
});

export const Subscription = model<ISubscription>(
  'Subscription',
  subscriptionSchema,
);
