import { model, Schema } from 'mongoose';
import { IResetToken } from './resetToken.interface';

const resetTokenSchema = new Schema<IResetToken>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expireAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

resetTokenSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const ResetToken = model<IResetToken>('Token', resetTokenSchema);
