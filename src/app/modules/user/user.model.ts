import bcrypt from 'bcrypt';
import { model, Schema } from 'mongoose';
import config from '../../../config';
import { USER_ROLES } from '../../../enums/user';
import { IUser, UserModal } from './user.interface';
import { SUBSCRIPTION_PLAN } from '../subscription/subscription.interface';

const userSchema = new Schema<IUser, UserModal>(
  {
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    contact: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    password: {
      type: String,
      select: 0,
      minlength: 8,
      default: null,
    },
    image: {
      type: String,
      default: 'https://i.ibb.co/z5YHLV9/profile.png',
    },
    imageKey: {
      type: String,
      default: null,
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'block'],
      default: 'active',
    },
    plan: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLAN),
      default: SUBSCRIPTION_PLAN.FREE,
    },
    expireDate: {
      type: Date,
      default: null,
    },
    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'facebook', 'github'],
      default: 'local',
    },
    providerId: {
      type: String,
      default: null,
      select: false,
    },
    authentication: {
      type: {
        isResetPassword: {
          type: Boolean,
          default: false,
        },
        oneTimeCode: {
          type: Number,
          default: null,
        },
        expireAt: {
          type: Date,
          default: null,
        },
      },
      select: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, returned) => {
        const safe = returned as Record<string, unknown>;
        delete safe.password;
        delete safe.authentication;
        delete safe.providerId;
        delete safe.imageKey;
        delete safe.__v;
        return returned;
      },
    },
  },
);

//exist user check
userSchema.statics.isExistUserById = async (id: string) => {
  const isExist = await User.findById(id);
  return isExist;
};

userSchema.statics.isExistUserByEmail = async (email: string) => {
  const isExist = await User.findOne({ email });
  return isExist;
};

//is match password
userSchema.statics.isMatchPassword = async (
  password: string,
  hashPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hashPassword);
};

userSchema.pre('save', async function (next) {
  //password hash (only for local auth with password)
  if (this.password && this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      Number(config.bcrypt_salt_rounds),
    );
  }
  next();
});

export const User = model<IUser, UserModal>('User', userSchema);
