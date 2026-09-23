import { Types } from 'mongoose';

export type IResetToken = {
  user: Types.ObjectId;
  token: string;
  expireAt: Date;
};
