import { Types } from 'mongoose';

export type IBankTransaction = {
  user: Types.ObjectId;
  amount: number;
  bankName: string;
  accountNumberLast4Digits: string;
  refId: string;
  date: Date;
};
