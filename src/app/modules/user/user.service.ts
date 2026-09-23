/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { USER_ROLES } from '../../../enums/user';
import ApiError from '../../../errors/ApiError';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import generateOTP from '../../../util/generateOTP';
import { IUser } from './user.interface';
import { User } from './user.model';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { compressImage } from '../../../helpers/fileProcessor';
import { errorLogger } from '../../../shared/logger';
import { deleteUserAccountData } from './accountCleanup.service';

const createUserToDB = async (
  payload: Pick<IUser, 'name' | 'contact' | 'email' | 'password'>,
): Promise<IUser> => {
  const otp = generateOTP();
  let createUser;
  try {
    createUser = await User.create({
      name: payload.name,
      contact: payload.contact,
      email: payload.email,
      password: payload.password,
      role: USER_ROLES.USER,
      authentication: {
        isResetPassword: false,
        oneTimeCode: otp,
        expireAt: new Date(Date.now() + 3 * 60000),
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ApiError(StatusCodes.CONFLICT, 'Email already exists');
    }
    throw error;
  }

  const values = {
    name: createUser.name,
    otp,
    email: createUser.email!,
  };
  const createAccountTemplate = emailTemplate.createAccountModern(values);
  try {
    await emailHelper.sendEmail(createAccountTemplate);
  } catch (error) {
    await User.deleteOne({ _id: createUser._id });
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      'Unable to send verification email. Please try again.',
    );
  }

  return createUser;
};

const getUserProfileFromDB = async (
  user: JwtPayload,
): Promise<Partial<IUser>> => {
  const { id } = user;
  const isExistUser = await User.isExistUserById(id);
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  return isExistUser;
};

const updateProfileToDB = async (
  user: JwtPayload,
  payload: Pick<Partial<IUser>, 'name' | 'contact' | 'location'> & {
    file?: Express.Multer.File;
  },
): Promise<Partial<IUser | null>> => {
  const { id } = user;
  const isExistUser = await User.findById(id).select('+imageKey');
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  const updateData: Pick<
    Partial<IUser>,
    'name' | 'contact' | 'location' | 'image' | 'imageKey'
  > = {
    name: payload.name,
    contact: payload.contact,
    location: payload.location,
  };
  Object.keys(updateData).forEach(key => {
    if (updateData[key as keyof typeof updateData] === undefined) {
      delete updateData[key as keyof typeof updateData];
    }
  });

  let newImageKey: string | undefined;
  if (payload.file) {
    const { buffer, originalname, mimetype } = payload.file;

    try {
      // Process and resize image
      const processedImageBuffer = await compressImage(buffer, 80, 200, 200); // Resize to 200x200

      // Upload to S3
      const uploadResult = await s3Uploader.uploadBufferToS3(
        processedImageBuffer,
        originalname,
        mimetype,
        'profile-pictures', // Custom key prefix for profile pictures
      );
      updateData.image = uploadResult.url;
      updateData.imageKey = uploadResult.key;
      newImageKey = uploadResult.key;
    } catch (error) {
      errorLogger.error('Error processing or uploading profile picture', error);
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Failed to process or upload profile picture.',
      );
    }
  }

  let updateDoc;
  try {
    updateDoc = await User.findOneAndUpdate({ _id: id }, updateData, {
      new: true,
      runValidators: true,
    });
  } catch (error) {
    if (newImageKey)
      await s3Uploader.deleteByKey(newImageKey).catch(() => undefined);
    throw error;
  }

  if (newImageKey && isExistUser.imageKey) {
    await s3Uploader.deleteByKey(isExistUser.imageKey).catch(error => {
      errorLogger.error('Failed to delete replaced profile picture', error);
    });
  }

  return updateDoc;
};

const deleteAccountFromDB = async (user: JwtPayload): Promise<IUser | null> => {
  const { id } = user;
  const deleted = await deleteUserAccountData(id);
  if (!deleted) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }
  return deleted;
};

import QueryBuilder from '../../../builder/QueryBuilder';

const getAllUsers = async (query: Record<string, any>) => {
  const userQuery = new QueryBuilder(User.find(), query)
    .search(['name', 'email'])
    .filter(['role', 'status', 'plan', 'verified'])
    .sort(['createdAt', 'name', 'email'])
    .paginate();

  const result = await userQuery.modelQuery;
  const pagination = await userQuery.pagination();

  return { pagination, result };
};

const updateUserStatusToDB = async (
  actor: JwtPayload,
  id: string,
  status: 'active' | 'block',
): Promise<IUser | null> => {
  const target = await User.findById(id).select('role');
  if (!target) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }
  if (
    actor.role !== USER_ROLES.SUPER_ADMIN &&
    target.role !== USER_ROLES.USER
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can update this account',
    );
  }
  const user = await User.findByIdAndUpdate(id, { status }, { new: true });
  if (!user) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }
  return user;
};

export const UserService = {
  createUserToDB,
  getUserProfileFromDB,
  updateProfileToDB,
  deleteAccountFromDB,
  getAllUsers,
  updateUserStatusToDB,
};
