import { model, Schema } from 'mongoose';
import { INotice } from './notices.interface';

const noticeSchema = new Schema<INotice>(
  {
    type: {
      type: String,
      enum: ['IRS Notice', 'Case Status'],
      required: true,
    },
    document: {
      type: String,
      required: true,
    },
    documentKey: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_document, returned) => {
        delete (returned as Record<string, unknown>).documentKey;
        return returned;
      },
    },
  },
);

export const Notice = model<INotice>('Notice', noticeSchema);
