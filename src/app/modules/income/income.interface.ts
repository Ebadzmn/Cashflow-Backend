import { Model, Types } from 'mongoose';

export type IIncome = {
  user: Types.ObjectId;
  amount: number;
  category: string;
  date: Date;
  description?: string;
  fileUrl?: string;
  fileKey?: string;
};

export type IncomeModel = Model<IIncome>;
