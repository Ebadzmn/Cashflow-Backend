import { model, Schema } from 'mongoose';

export type IAppleNotification = {
  notificationUUID: string;
  notificationType?: string;
  subtype?: string;
  signedDate?: Date;
  transactionId?: string;
  originalTransactionId?: string;
  processedAt?: Date | null;
  processingStartedAt?: Date | null;
  processingToken?: string;
};

const appleNotificationSchema = new Schema<IAppleNotification>(
  {
    notificationUUID: { type: String, required: true, unique: true },
    notificationType: String,
    subtype: String,
    signedDate: Date,
    transactionId: String,
    originalTransactionId: String,
    processedAt: { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    processingToken: String,
  },
  { timestamps: true },
);

export const AppleNotification = model<IAppleNotification>(
  'AppleNotification',
  appleNotificationSchema,
);
