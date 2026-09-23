import { randomInt } from 'crypto';

const generateOTP = () => {
  return randomInt(100_000, 1_000_000);
};

export default generateOTP;
