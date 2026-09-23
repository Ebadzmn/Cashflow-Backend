import { Schema, model } from 'mongoose';
import { IBankTransaction } from './bankTransaction.interface';

const bankTransactionSchema = new Schema<IBankTransaction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    bankName: {
      type: String,
      required: true,
    },
    accountNumberLast4Digits: {
      type: String,
      required: true,
    },
    refId: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  },
);

bankTransactionSchema.index({ user: 1, refId: 1 }, { unique: true });
bankTransactionSchema.index({ user: 1, date: -1 });
bankTransactionSchema.index({ user: 1, createdAt: -1 });

export const BankTransaction = model<IBankTransaction>(
  'BankTransaction',
  bankTransactionSchema,
);
