/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BILLING_CYCLE,
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
} from '../subscription/subscription.interface';
import { Subscription } from '../subscription/subscription.model';
import { User } from '../user/user.model';
import { IUser } from '../user/user.interface';
import { IDashboardData } from './admin.interface';
import QueryBuilder from '../../../builder/QueryBuilder';

import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { USER_ROLES } from '../../../enums/user';
import { deleteUserAccountData } from '../user/accountCleanup.service';

const getDashboardData = async (): Promise<IDashboardData> => {
  // 1. Total Revenue calculation using aggregation
  const revenuePromise = Subscription.aggregate([
    {
      $match: {
        status: SUBSCRIPTION_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: {
          $sum: {
            $switch: {
              branches: [
                // Basic Growth
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.BASIC_GROWTH] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      29,
                      299,
                    ],
                  },
                },
                // Pro Professional
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.PRO_PROFESSIONAL] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      59,
                      599,
                    ],
                  },
                },
                // Elite Power User
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.ELITE_POWER_USER] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      99,
                      999,
                    ],
                  },
                },
                // Shield Audit Defense
                {
                  case: {
                    $eq: ['$plan', SUBSCRIPTION_PLAN.SHIELD_AUDIT_DEFENSE],
                  },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      149,
                      1499,
                    ],
                  },
                },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);

  // 2. Total Active Users (status: 'active')
  const activeUsersPromise = User.countDocuments({ status: 'active' });

  // 3. Total Subscribers (users with active subscription)
  const subscribersPromise = User.countDocuments({
    plan: { $ne: SUBSCRIPTION_PLAN.FREE },
  });

  // 4. New Subscribers (Last 60 Days)
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const newSubscribersPromise = Subscription.countDocuments({
    createdAt: { $gte: sixtyDaysAgo },
    status: SUBSCRIPTION_STATUS.ACTIVE,
  });

  // 5. Subscription Distribution (Percentage)
  const distributionPromise = User.aggregate([
    {
      $match: {
        plan: { $ne: SUBSCRIPTION_PLAN.FREE },
      },
    },
    {
      $group: {
        _id: '$plan',
        count: { $sum: 1 },
      },
    },
  ]);

  const [
    revenueAggregation,
    totalActiveUsers,
    totalSubscribers,
    newSubscribersLast60Days,
    distributionAggregation,
  ] = await Promise.all([
    revenuePromise,
    activeUsersPromise,
    subscribersPromise,
    newSubscribersPromise,
    distributionPromise,
  ]);
  const totalRevenue =
    revenueAggregation.length > 0 ? revenueAggregation[0].totalRevenue : 0;
  const subscriptionDistribution = distributionAggregation.map(item => ({
    plan: item._id,
    count: item.count,
    percentage:
      totalSubscribers > 0
        ? Number(((item.count / totalSubscribers) * 100).toFixed(2))
        : 0,
  }));

  return {
    totalRevenue,
    totalActiveUsers,
    totalSubscribers,
    newSubscribersLast60Days,
    subscriptionDistribution,
  };
};

const getAllSubscribers = async (query: Record<string, any>) => {
  const queryObj = { ...query };

  // Remove any user-provided plan filter to prevent override
  delete queryObj.plan;

  const subscriberQuery = new QueryBuilder(User.find(), queryObj)
    .search(['name', 'email'])
    .filter(['status', 'verified'])
    .sort(['createdAt', 'name', 'email'])
    .paginate();

  // Define all premium plans (excluding FREE)
  const premiumPlans = [
    SUBSCRIPTION_PLAN.BASIC_GROWTH,
    SUBSCRIPTION_PLAN.PRO_PROFESSIONAL,
    SUBSCRIPTION_PLAN.ELITE_POWER_USER,
    SUBSCRIPTION_PLAN.SHIELD_AUDIT_DEFENSE,
  ];

  // Force the filter to only include premium plans
  // This is applied AFTER .filter() to ensure it isn't overridden
  subscriberQuery.modelQuery = subscriberQuery.modelQuery.find({
    plan: { $in: premiumPlans },
  });

  const result = await subscriberQuery.modelQuery;
  const pagination = await subscriberQuery.pagination();

  return { result, pagination };
};

const getMonthlyRevenue = async () => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const revenueByMonth = await Subscription.aggregate([
    {
      $match: {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: {
          $sum: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.BASIC_GROWTH] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      29,
                      299,
                    ],
                  },
                },
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.PRO_PROFESSIONAL] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      59,
                      599,
                    ],
                  },
                },
                {
                  case: { $eq: ['$plan', SUBSCRIPTION_PLAN.ELITE_POWER_USER] },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      99,
                      999,
                    ],
                  },
                },
                {
                  case: {
                    $eq: ['$plan', SUBSCRIPTION_PLAN.SHIELD_AUDIT_DEFENSE],
                  },
                  then: {
                    $cond: [
                      { $eq: ['$billingCycle', BILLING_CYCLE.MONTHLY] },
                      149,
                      1499,
                    ],
                  },
                },
              ],
              default: 0,
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        year: '$_id.year',
        month: '$_id.month',
        revenue: 1,
      },
    },
    {
      $sort: { year: -1, month: -1 },
    },
  ]);

  return revenueByMonth;
};

const deleteAccount = async (actor: JwtPayload, userId: string) => {
  const user = await User.findById(userId).select('role');
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }
  if (actor.role !== USER_ROLES.SUPER_ADMIN && user.role !== USER_ROLES.USER) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can delete this account',
    );
  }
  await deleteUserAccountData(userId);

  return { message: 'Account and all related data deleted successfully' };
};

const updateUser = async (
  actor: JwtPayload,
  userId: string,
  payload: Partial<IUser>,
) => {
  const isExist = await User.findById(userId);
  if (!isExist) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (
    actor.role !== USER_ROLES.SUPER_ADMIN &&
    isExist.role !== USER_ROLES.USER
  ) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can update this account',
    );
  }
  if (payload.role && actor.role !== USER_ROLES.SUPER_ADMIN) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      'Only a super admin can change roles',
    );
  }
  const update: Partial<IUser> = {};
  for (const field of ['name', 'contact', 'location', 'status'] as const) {
    const value = payload[field];
    if (value !== undefined) update[field] = value as never;
  }
  if (payload.role && Object.values(USER_ROLES).includes(payload.role)) {
    update.role = payload.role;
  }
  const result = await User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  });

  return result;
};

export const AdminService = {
  getDashboardData,
  getAllSubscribers,
  getMonthlyRevenue,
  deleteAccount,
  updateUser,
};
