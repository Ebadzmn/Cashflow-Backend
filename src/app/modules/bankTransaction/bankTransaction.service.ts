import QueryBuilder from '../../../builder/QueryBuilder';
import { IBankTransaction } from './bankTransaction.interface';
import { BankTransaction } from './bankTransaction.model';
import { JwtPayload } from 'jsonwebtoken';

const createBankTransactionToDB = async (
  user: JwtPayload,
  payload: Omit<IBankTransaction, 'user'>,
): Promise<IBankTransaction> => {
  const result = await BankTransaction.create({ ...payload, user: user.id });
  return result;
};

const getAllBankTransactionsFromDB = async (
  user: JwtPayload,
  query: Record<string, unknown>,
) => {
  const bankTransactionQuery = new QueryBuilder(
    BankTransaction.find({ user: user.id }),
    query,
  )
    .search(['bankName', 'accountNumberLast4Digits', 'refId'])
    .filter(['bankName', 'accountNumberLast4Digits', 'refId', 'date'])
    .sort(['createdAt', 'date', 'amount'])
    .paginate();

  const result = await bankTransactionQuery.modelQuery;
  const pagination = await bankTransactionQuery.pagination();

  return {
    pagination,
    result,
  };
};

const updateBankTransactionToDB = async (
  user: JwtPayload,
  id: string,
  payload: Partial<Omit<IBankTransaction, 'user'>>,
): Promise<IBankTransaction | null> => {
  const result = await BankTransaction.findOneAndUpdate(
    { _id: id, user: user.id },
    payload,
    { new: true, runValidators: true },
  );
  return result;
};

const deleteBankTransactionToDB = async (
  user: JwtPayload,
  id: string,
): Promise<boolean> => {
  const result = await BankTransaction.deleteOne({ _id: id, user: user.id });
  return result.deletedCount === 1;
};

export const BankTransactionService = {
  createBankTransactionToDB,
  getAllBankTransactionsFromDB,
  updateBankTransactionToDB,
  deleteBankTransactionToDB,
};
