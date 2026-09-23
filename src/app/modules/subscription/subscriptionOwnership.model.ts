import { model, Schema, Types } from 'mongoose';

export type ISubscriptionOwnership = {
  originalTransactionId: string;
  user: Types.ObjectId;
};

const subscriptionOwnershipSchema = new Schema<ISubscriptionOwnership>(
  {
    originalTransactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

export const SubscriptionOwnership = model<ISubscriptionOwnership>(
  'SubscriptionOwnership',
  subscriptionOwnershipSchema,
);
