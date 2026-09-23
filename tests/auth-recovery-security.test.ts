/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';
import { AuthService } from '../src/app/modules/auth/auth.service';
import { ResetToken } from '../src/app/modules/resetToken/resetToken.model';
import { User } from '../src/app/modules/user/user.model';

describe('account recovery safeguards', () => {
  it('consumes an OTP atomically and stores only a reset-token hash', async () => {
    const user = {
      _id: '507f1f77bcf86cd799439011',
      verified: true,
    };
    const select = jest.fn().mockResolvedValue(user);
    jest
      .spyOn(User, 'findOneAndUpdate')
      .mockReturnValueOnce({ select } as any)
      .mockResolvedValueOnce(user as any);
    jest.spyOn(ResetToken, 'deleteMany').mockResolvedValue({} as any);
    const create = jest
      .spyOn(ResetToken, 'create')
      .mockResolvedValue({} as any);

    const result = await AuthService.verifyEmailToDB({
      email: 'recovery@example.com',
      oneTimeCode: 123456,
    });

    expect(User.findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        email: 'recovery@example.com',
        'authentication.oneTimeCode': 123456,
        'authentication.expireAt': { $gt: expect.any(Date) },
      }),
      expect.any(Object),
      { new: false },
    );
    expect(result.data).toMatch(/^[a-f0-9]{64}$/);
    const storedToken = (create.mock.calls[0][0] as any).token;
    expect(storedToken).toBe(
      createHash('sha256')
        .update(result.data as string)
        .digest('hex'),
    );
    expect(storedToken).not.toBe(result.data);
  });

  it('atomically consumes the hashed reset token before changing a password', async () => {
    const rawToken = 'reset-token-that-never-reaches-the-database';
    const tokenRecord = { user: '507f1f77bcf86cd799439011' };
    const consume = jest
      .spyOn(ResetToken, 'findOneAndDelete')
      .mockResolvedValue(tokenRecord as any);
    const select = jest.fn().mockResolvedValue({
      authentication: { isResetPassword: true },
    });
    jest.spyOn(User, 'findById').mockReturnValue({ select } as any);
    jest.spyOn(User, 'findOneAndUpdate').mockResolvedValue({} as any);
    jest.spyOn(ResetToken, 'deleteMany').mockResolvedValue({} as any);

    await AuthService.resetPasswordToDB(rawToken, {
      newPassword: 'new-password-123',
      confirmPassword: 'new-password-123',
    });

    expect(consume).toHaveBeenCalledWith({
      token: createHash('sha256').update(rawToken).digest('hex'),
      expireAt: { $gt: expect.any(Date) },
    });
    expect(User.findOneAndUpdate).toHaveBeenCalled();
  });

  it('does not reveal whether a recovery account exists', async () => {
    jest.spyOn(User, 'isExistUserByEmail').mockResolvedValue(null);
    await expect(
      AuthService.forgetPasswordToDB('missing@example.com'),
    ).resolves.toBeUndefined();
  });
});
