import { JwtPayload } from 'jsonwebtoken';
import { Income } from '../income/income.model';
import { Expense } from '../expense/expense.model';

const getAuditRiskCountFromDB = async (user: JwtPayload) => {
  const userId = user.id;

  const missingFileFilter = {
    user: userId,
    $or: [{ fileUrl: { $exists: false } }, { fileUrl: null }, { fileUrl: '' }],
  };
  const [incomeRiskyRecords, expenseRiskyRecords] = await Promise.all([
    Income.countDocuments(missingFileFilter),
    Expense.countDocuments(missingFileFilter),
  ]);

  const totalRiskyRecords = incomeRiskyRecords + expenseRiskyRecords;

  return { count: totalRiskyRecords };
};

export const AuditRiskService = {
  getAuditRiskCountFromDB,
};
