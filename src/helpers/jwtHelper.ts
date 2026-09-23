import jwt, { JwtPayload, Secret, SignOptions } from 'jsonwebtoken';

const createToken = (
  payload: object,
  secret: Secret,
  expireTime: string | number,
): string => {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: expireTime as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, secret as string, options);
};

const verifyToken = (token: string, secret: Secret): JwtPayload => {
  return jwt.verify(token, secret as string, {
    algorithms: ['HS256'],
  }) as JwtPayload;
};

export const jwtHelper = { createToken, verifyToken };
