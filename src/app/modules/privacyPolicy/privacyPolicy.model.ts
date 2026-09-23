import { Schema, model } from 'mongoose';
import { IPrivacyPolicy } from './privacyPolicy.interface';

const PrivacyPolicySchema = new Schema<IPrivacyPolicy>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  },
);

export const PrivacyPolicy = model<IPrivacyPolicy>(
  'PrivacyPolicy',
  PrivacyPolicySchema,
);
