/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-empty */
import { JwtPayload } from 'jsonwebtoken';
import { IExpense } from './expense.interface';
import { Expense } from './expense.model';
import { s3Uploader } from '../../../helpers/s3Uploader';
import { Types } from 'mongoose';

import QueryBuilder from '../../../builder/QueryBuilder';
import { errorLogger } from '../../../shared/logger';

const createExpenseToDB = async (
  user: JwtPayload,
  payload: Omit<IExpense, 'user'>,
) => {
  const doc = await Expense.create({
    user: user.id,
    amount: payload.amount,
    category: payload.category,
    date: payload.date,
    description: payload.description,
    fileUrl: payload.fileUrl,
    fileKey: payload.fileKey,
  });
  return doc;
};

const getExpenseFromDB = async (
  user: JwtPayload,
  query: Record<string, any>,
) => {
  const userId = user.id;
  let monthParam = query.month;
  let yearParam = query.year;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-');
    yearParam = y;
    monthParam = String(Number(m));
  }

  if (monthParam && yearParam) {
    const m = Number(monthParam);
    const y = Number(yearParam);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) {
      return {
        mode: 'detailed',
        data: [],
        pagination: { page: 1, limit: 10, totalPage: 0, total: 0 },
      };
    }
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    const databaseQuery = { ...query };
    delete databaseQuery.month;
    delete databaseQuery.year;

    const expenseQuery = new QueryBuilder(
      Expense.find({
        user: userId,
        date: { $gte: start, $lt: end },
      }),
      databaseQuery,
    )
      .filter(['category'])
      .sort(['createdAt', 'date', 'amount'])
      .paginate();

    const result = await expenseQuery.modelQuery;
    const pagination = await expenseQuery.pagination();

    return { mode: 'detailed', data: result, pagination };
  }

  const summary = await Expense.aggregate([
    { $match: { user: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: { y: { $year: '$date' }, m: { $month: '$date' } },
        total: { $sum: '$amount' },
      },
    },
    {
      $project: {
        _id: 0,
        year: '$_id.y',
        month: '$_id.m',
        total: 1,
      },
    },
    { $sort: { year: -1, month: -1 } },
  ]);
  return { mode: 'summary', data: summary };
};

const updateExpenseToDB = async (
  user: JwtPayload,
  id: string,
  payload: Partial<IExpense>,
) => {
  const doc = await Expense.findOne({ _id: id, user: user.id });
  if (!doc) {
    return null;
  }
  const previousFileKey = doc.fileKey;
  if (payload.amount !== undefined) doc.amount = payload.amount;
  if (payload.category !== undefined) doc.category = payload.category;
  if (payload.date !== undefined) doc.date = payload.date as any;
  if (payload.description !== undefined) doc.description = payload.description;
  if (payload.fileUrl !== undefined) doc.fileUrl = payload.fileUrl;
  if (payload.fileKey !== undefined) doc.fileKey = payload.fileKey;
  await doc.save();

  if (
    payload.fileUrl &&
    payload.fileKey &&
    previousFileKey &&
    previousFileKey !== payload.fileKey
  ) {
    try {
      await s3Uploader.deleteByKey(previousFileKey);
    } catch (error) {
      errorLogger.error('Failed to delete replaced expense attachment', error);
    }
  }

  return doc;
};

const deleteExpenseFromDB = async (user: JwtPayload, id: string) => {
  const doc = await Expense.findOne({ _id: id, user: user.id });
  if (!doc) {
    return null;
  }
  await Expense.deleteOne({ _id: id, user: user.id });
  if (doc.fileKey) {
    try {
      await s3Uploader.deleteByKey(doc.fileKey);
    } catch (error) {
      errorLogger.error('Failed to delete expense attachment', error);
    }
  }
  return { id };
};

const getExpenseHistoryFromDB = async (
  user: JwtPayload,
  query: Record<string, any>,
) => {
  const userId = user.id;
  const expenseQuery = new QueryBuilder(Expense.find({ user: userId }), query)
    .filter(['category'])
    .sort(['createdAt', 'date', 'amount'])
    .paginate();

  const result = await expenseQuery.modelQuery;
  const pagination = await expenseQuery.pagination();

  return { result, pagination };
};

export const ExpenseService = {
  createExpenseToDB,
  getExpenseFromDB,
  updateExpenseToDB,
  deleteExpenseFromDB,
  getExpenseHistoryFromDB,
};
