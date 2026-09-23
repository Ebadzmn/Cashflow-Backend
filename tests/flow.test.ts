import { Income } from '../src/app/modules/income/income.model';
import { Expense } from '../src/app/modules/expense/expense.model';
import { IncomeService } from '../src/app/modules/income/income.service';
import { ExpenseService } from '../src/app/modules/expense/expense.service';
import { BankTransaction } from '../src/app/modules/bankTransaction/bankTransaction.model';
import { BankTransactionService } from '../src/app/modules/bankTransaction/bankTransaction.service';

type QueryHarness = {
  query: Record<string, unknown>;
  filters: Record<string, unknown>[];
};

type QueryChain = {
  model: { countDocuments: jest.Mock };
  getFilter: jest.Mock;
  find: jest.Mock;
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  then: (resolve: (value: unknown[]) => void) => void;
};

const makeQuery = (rows: unknown[] = []) => {
  const harness: QueryHarness = { query: {}, filters: [] };
  const chain = {} as QueryChain;
  Object.assign(chain, {
    model: { countDocuments: jest.fn().mockResolvedValue(rows.length) },
    getFilter: jest.fn(() => harness.query),
    find: jest.fn((filter: Record<string, unknown>) => {
      harness.filters.push(filter);
      harness.query = { ...harness.query, ...filter };
      return chain;
    }),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    then: (resolve: (value: unknown[]) => void) => resolve(rows),
  });
  return { chain, harness };
};

describe('cash-flow monthly detail flows', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['income', Income, IncomeService.getIncomeFromDB],
    ['expense', Expense, ExpenseService.getExpenseFromDB],
  ] as const)(
    'returns %s records without leaking virtual month filters into MongoDB',
    async (_name, model, service) => {
      const { chain, harness } = makeQuery([{ amount: 25 }]);
      jest.spyOn(model, 'find').mockReturnValue(chain as never);

      const result = await service(
        { id: '507f1f77bcf86cd799439011' },
        { month: '2026-08', page: '1', limit: '10' },
      );

      expect(result.mode).toBe('detailed');
      expect(result.data).toHaveLength(1);
      expect(harness.filters).toEqual([]);
      expect(model.find).toHaveBeenCalledWith({
        user: '507f1f77bcf86cd799439011',
        date: {
          $gte: new Date('2026-08-01T00:00:00.000Z'),
          $lt: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
    },
  );
});

describe('bank transaction ownership flow', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scopes mutations to the authenticated user', async () => {
    const update = jest
      .spyOn(BankTransaction, 'findOneAndUpdate')
      .mockResolvedValue(null);
    const remove = jest
      .spyOn(BankTransaction, 'deleteOne')
      .mockResolvedValue({ deletedCount: 0 } as never);
    const user = { id: '507f1f77bcf86cd799439011' };

    await BankTransactionService.updateBankTransactionToDB(
      user,
      '507f191e810c19729de860ea',
      { amount: 50 },
    );
    await BankTransactionService.deleteBankTransactionToDB(
      user,
      '507f191e810c19729de860ea',
    );

    expect(update).toHaveBeenCalledWith(
      {
        _id: '507f191e810c19729de860ea',
        user: '507f1f77bcf86cd799439011',
      },
      { amount: 50 },
      { new: true, runValidators: true },
    );
    expect(remove).toHaveBeenCalledWith({
      _id: '507f191e810c19729de860ea',
      user: '507f1f77bcf86cd799439011',
    });
  });
});
