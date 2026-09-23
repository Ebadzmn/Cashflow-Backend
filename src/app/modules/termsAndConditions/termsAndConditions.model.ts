import { Schema, model } from 'mongoose';
import {
  ITermsAndConditions,
  TermsAndConditionsModel,
} from './termsAndConditions.interface.js';

const TermsAndConditionsSchema = new Schema<ITermsAndConditions>(
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

export const TermsAndConditions = model<
  ITermsAndConditions,
  TermsAndConditionsModel
>('TermsAndConditions', TermsAndConditionsSchema);
