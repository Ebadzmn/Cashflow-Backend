import { model, Schema, Types } from 'mongoose';

export type IOAuthCode = {
  codeHash: string;
  user: Types.ObjectId;
  expiresAt: Date;
};

const oauthCodeSchema = new Schema<IOAuthCode>(
  {
    codeHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

oauthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthCode = model<IOAuthCode>('OAuthCode', oauthCodeSchema);
