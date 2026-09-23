/* eslint-disable @typescript-eslint/no-explicit-any */
// import { StatusCodes } from 'http-status-codes';
// import ApiError from '../../../errors/ApiError';
import QueryBuilder from '../../../builder/QueryBuilder';
import { ITermsAndConditions } from './termsAndConditions.interface';
import { TermsAndConditions } from './termsAndConditions.model';

const createTermsAndConditions = async (
  payload: ITermsAndConditions,
): Promise<ITermsAndConditions | null> => {
  const result = await TermsAndConditions.create(payload);
  return result;
};

const getAllTermsAndConditions = async (query: Record<string, any>) => {
  const termsQuery = new QueryBuilder(TermsAndConditions.find({}), query)
    .filter(['title'])
    .sort(['createdAt', 'title'])
    .paginate();

  const result = await termsQuery.modelQuery;
  const pagination = await termsQuery.pagination();

  return { result, pagination };
};

const getSingleTermsAndConditions = async (
  id: string,
): Promise<ITermsAndConditions | null> => {
  const result = await TermsAndConditions.findById(id);
  return result;
};

const updateTermsAndConditions = async (
  id: string,
  payload: Partial<ITermsAndConditions>,
): Promise<ITermsAndConditions | null> => {
  const result = await TermsAndConditions.findOneAndUpdate(
    { _id: id },
    payload,
    {
      new: true,
    },
  );
  return result;
};

const deleteTermsAndConditions = async (
  id: string,
): Promise<ITermsAndConditions | null> => {
  const result = await TermsAndConditions.findByIdAndDelete(id);
  return result;
};

export const TermsAndConditionsService = {
  createTermsAndConditions,
  getAllTermsAndConditions,
  getSingleTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions,
};
