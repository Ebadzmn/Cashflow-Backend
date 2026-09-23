import { Model, Types } from 'mongoose';

export type IExpense = {
  user: Types.ObjectId;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  fileUrl?: string;
  fileKey?: string;
  fileName?: string;
};

export type ExpenseModel = Model<IExpense>;
