import QueryBuilder from '../../../builder/QueryBuilder';
import { IPrivacyPolicy } from './privacyPolicy.interface';
import { PrivacyPolicy } from './privacyPolicy.model';

const createPrivacyPolicy = async (
  payload: IPrivacyPolicy,
): Promise<IPrivacyPolicy | null> => {
  const result = await PrivacyPolicy.create(payload);
  return result as IPrivacyPolicy | null;
};

const getAllPrivacyPolicies = async (query: Record<string, unknown>) => {
  const privacyPolicyQuery = new QueryBuilder(PrivacyPolicy.find({}), query)
    .filter(['title'])
    .sort(['createdAt', 'title'])
    .paginate();

  const result = await privacyPolicyQuery.modelQuery;
  const pagination = await privacyPolicyQuery.pagination();

  return { result, pagination };
};

const getSinglePrivacyPolicy = async (
  id: string,
): Promise<IPrivacyPolicy | null> => {
  const result = await PrivacyPolicy.findById(id);
  return result as IPrivacyPolicy | null;
};

const updatePrivacyPolicy = async (
  id: string,
  payload: Partial<IPrivacyPolicy>,
): Promise<IPrivacyPolicy | null> => {
  const result = await PrivacyPolicy.findOneAndUpdate({ _id: id }, payload, {
    new: true,
  });
  return result as IPrivacyPolicy | null;
};

const deletePrivacyPolicy = async (
  id: string,
): Promise<IPrivacyPolicy | null> => {
  const result = await PrivacyPolicy.findByIdAndDelete(id);
  return result as IPrivacyPolicy | null;
};

export const PrivacyPolicyService = {
  createPrivacyPolicy,
  getAllPrivacyPolicies,
  getSinglePrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
};
