export type ISubscriptionDistribution = {
  plan: string;
  count: number;
  percentage: number;
};

export type IDashboardData = {
  totalRevenue: number;
  totalActiveUsers: number;
  totalSubscribers: number;
  newSubscribersLast60Days: number;
  subscriptionDistribution: ISubscriptionDistribution[];
};
