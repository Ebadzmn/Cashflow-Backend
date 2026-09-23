import { model, Schema } from 'mongoose';
import { IIncome, IncomeModel } from './income.interface';

const incomeSchema = new Schema<IIncome, IncomeModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    fileUrl: {
      type: String,
      default: null,
    },
    fileKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

incomeSchema.index({ user: 1, date: -1 });
incomeSchema.index({ user: 1, createdAt: -1 });

export const Income = model<IIncome, IncomeModel>('Income', incomeSchema);
