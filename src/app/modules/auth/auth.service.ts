import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { emailHelper } from '../../../helpers/emailHelper';
import { jwtHelper } from '../../../helpers/jwtHelper';
import { emailTemplate } from '../../../shared/emailTemplate';
import {
  IAuthResetPassword,
  IChangePassword,
  ILoginData,
  IVerifyEmail,
} from '../../../types/auth';
import cryptoToken from '../../../util/cryptoToken';
import generateOTP from '../../../util/generateOTP';
import { ResetToken } from '../resetToken/resetToken.model';
import { User } from '../user/user.model';

const dummyPasswordHash = bcrypt.hash(
  'cashflow-invalid-login-sentinel',
  Number(config.bcrypt_salt_rounds),
);

//login
const loginUserFromDB = async (payload: ILoginData) => {
  const { email, password } = payload;
  const isExistUser = await User.findOne({ email }).select('+password');
  const passwordMatches = await bcrypt.compare(
    password,
    isExistUser?.password || (await dummyPasswordHash),
  );
  if (!isExistUser || !isExistUser.password || !passwordMatches) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid email or password');
  }

  if (!isExistUser.verified || isExistUser.status === 'block') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Account is not active');
  }

  //create access token
  const accessToken = jwtHelper.createToken(
    { id: isExistUser._id, role: isExistUser.role, email: isExistUser.email },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  //create refresh token
  const refreshToken = jwtHelper.createToken(
    { id: isExistUser._id, role: isExistUser.role, email: isExistUser.email },
    config.jwt.jwt_refresh_secret as Secret,
    config.jwt.jwt_refresh_expire_in as string,
  );

  return { accessToken, refreshToken };
};

//forget password
const forgetPasswordToDB = async (email: string) => {
  const isExistUser = await User.isExistUserByEmail(email);
  if (!isExistUser) {
    return;
  }

  //send mail
  const otp = generateOTP();
  const value = {
    otp,
    email: isExistUser.email,
  };
  const forgetPassword = emailTemplate.resetPasswordModern(value);
  await emailHelper.sendEmail(forgetPassword);

  //save to DB
  const authentication = {
    oneTimeCode: otp,
    expireAt: new Date(Date.now() + 3 * 60000),
  };
  await User.findOneAndUpdate({ email }, { $set: { authentication } });
};

//verify email
const verifyEmailToDB = async (payload: IVerifyEmail) => {
  const { email, oneTimeCode } = payload;
  const isExistUser = await User.findOneAndUpdate(
    {
      email,
      'authentication.oneTimeCode': oneTimeCode,
      'authentication.expireAt': { $gt: new Date() },
    },
    {
      $set: {
        'authentication.oneTimeCode': null,
        'authentication.expireAt': null,
      },
    },
    { new: false },
  ).select('+authentication');
  if (!isExistUser) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'The verification code is invalid or expired',
    );
  }

  let message;
  let data;

  if (!isExistUser.verified) {
    await User.findOneAndUpdate(
      { _id: isExistUser._id },
      { $set: { verified: true } },
    );
    message = 'Email verify successfully';
  } else {
    await User.findOneAndUpdate(
      { _id: isExistUser._id },
      {
        authentication: {
          isResetPassword: true,
        },
      },
    );

    //create token ;
    const createToken = cryptoToken();
    await ResetToken.deleteMany({ user: isExistUser._id });
    await ResetToken.create({
      user: isExistUser._id,
      token: createHash('sha256').update(createToken).digest('hex'),
      expireAt: new Date(Date.now() + 5 * 60000),
    });
    message =
      'Verification Successful: Please securely store and utilize this code for reset password';
    data = createToken;
  }
  return { data, message };
};

//forget password
const resetPasswordToDB = async (
  token: string,
  payload: IAuthResetPassword,
) => {
  const { newPassword, confirmPassword } = payload;
  if (!token) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not authorized');
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "New password and Confirm password doesn't match!",
    );
  }

  const isExistToken = await ResetToken.findOneAndDelete({
    token: createHash('sha256').update(token).digest('hex'),
    expireAt: { $gt: new Date() },
  });
  if (!isExistToken) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not authorized');
  }

  //user permission check
  const isExistUser = await User.findById(isExistToken.user).select(
    '+authentication',
  );
  if (!isExistUser?.authentication?.isResetPassword) {
    throw new ApiError(
      StatusCodes.UNAUTHORIZED,
      "You don't have permission to change the password. Please click again to 'Forgot Password'",
    );
  }

  const hashPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const updateData = {
    password: hashPassword,
    authentication: {
      isResetPassword: false,
    },
  };

  await User.findOneAndUpdate({ _id: isExistToken.user }, updateData, {
    new: true,
  });
  await ResetToken.deleteMany({ user: isExistToken.user });
};

const changePasswordToDB = async (
  user: JwtPayload,
  payload: IChangePassword,
) => {
  const { currentPassword, newPassword, confirmPassword } = payload;
  const isExistUser = await User.findById(user.id).select('+password');
  if (!isExistUser) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "User doesn't exist!");
  }

  //current password match
  if (
    !currentPassword ||
    !isExistUser.password ||
    !(await User.isMatchPassword(currentPassword, isExistUser.password))
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Password is incorrect');
  }

  //newPassword and current password
  if (currentPassword === newPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Please give different password from current password',
    );
  }
  //new password and confirm password check
  if (newPassword !== confirmPassword) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Password and Confirm password doesn't matched",
    );
  }

  //hash password
  const hashPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const updateData = {
    password: hashPassword,
  };
  await User.findOneAndUpdate({ _id: user.id }, updateData, { new: true });
};

const refreshToken = async (token: string) => {
  // verify token
  let verifiedToken = null;
  try {
    verifiedToken = jwtHelper.verifyToken(
      token,
      config.jwt.jwt_refresh_secret as Secret,
    ) as JwtPayload;
  } catch (error) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Invalid refresh token');
  }

  const { email } = verifiedToken;

  // check user
  const isUserExist = await User.isExistUserByEmail(email);
  if (!isUserExist) {
    throw new ApiError(StatusCodes.NOT_FOUND, "User doesn't exists");
  }
  if (!isUserExist.verified || isUserExist.status !== 'active') {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Account is not active');
  }

  // generate new token
  const newAccessToken = jwtHelper.createToken(
    {
      id: isUserExist._id,
      role: isUserExist.role,
      email: isUserExist.email,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.jwt_expire_in as string,
  );

  const newRefreshToken = jwtHelper.createToken(
    {
      id: isUserExist._id,
      role: isUserExist.role,
      email: isUserExist.email,
    },
    config.jwt.jwt_refresh_secret as Secret,
    config.jwt.jwt_refresh_expire_in as string,
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

// resend otp
const resendOtpToDB = async (email: string) => {
  const isExistUser = await User.findOne({ email });
  if (!isExistUser) {
    return { message: 'If the account exists, a code has been sent' };
  }

  // If user already verified, no need to resend
  // if (isExistUser.verified) {
  //   throw new ApiError(
  //     StatusCodes.BAD_REQUEST,
  //     'Your account is already verified'
  //   );
  // }

  //generate new otp
  const otp = generateOTP();
  const values = {
    name: isExistUser.name,
    otp,
    email: isExistUser.email!,
  };

  const resendTemplate = emailTemplate.createAccountModern(values);
  await emailHelper.sendEmail(resendTemplate);

  //save otp to DB
  const authentication = {
    oneTimeCode: otp,
    expireAt: new Date(Date.now() + 3 * 60000), // 3 minutes expiry
  };

  await User.findOneAndUpdate(
    { _id: isExistUser._id },
    { $set: { authentication } },
  );

  return { message: 'OTP resent successfully, please check your email' };
};

export const AuthService = {
  verifyEmailToDB,
  loginUserFromDB,
  forgetPasswordToDB,
  resetPasswordToDB,
  changePasswordToDB,
  resendOtpToDB,
  refreshToken,
};
