import { model, Schema } from 'mongoose';
import { IExpense, ExpenseModel } from './expense.interface';

const expenseSchema = new Schema<IExpense, ExpenseModel>(
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
      required: false, // Made optional
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
    fileName: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, createdAt: -1 });

export const Expense = model<IExpense, ExpenseModel>('Expense', expenseSchema);
