import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Secret } from 'jsonwebtoken';
import config from '../../config';
import ApiError from '../../errors/ApiError';
import { jwtHelper } from '../../helpers/jwtHelper';
import { User } from '../modules/user/user.model';

const auth =
  (...roles: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokenWithBearer = req.headers.authorization;
      if (!tokenWithBearer) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not authorized');
      }

      if (!tokenWithBearer.startsWith('Bearer ')) {
        throw new ApiError(
          StatusCodes.UNAUTHORIZED,
          'Authorization header must use the Bearer scheme',
        );
      }

      const token = tokenWithBearer.slice('Bearer '.length).trim();
      if (!token) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not authorized');
      }

      //verify token
      const verifyUser = jwtHelper.verifyToken(
        token,
        config.jwt.jwt_secret as Secret,
      );
      const currentUser = await User.findById(verifyUser.id).select(
        'role email status verified',
      );
      if (
        !currentUser ||
        !currentUser.verified ||
        currentUser.status !== 'active'
      ) {
        throw new ApiError(StatusCodes.UNAUTHORIZED, 'Account is not active');
      }

      // Use current database authorization state rather than stale JWT claims.
      req.user = {
        ...verifyUser,
        id: currentUser._id.toString(),
        role: currentUser.role,
        email: currentUser.email,
      };

      //guard user
      if (roles.length && !roles.includes(currentUser.role)) {
        throw new ApiError(
          StatusCodes.FORBIDDEN,
          "You don't have permission to access this api",
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };

export default auth;
