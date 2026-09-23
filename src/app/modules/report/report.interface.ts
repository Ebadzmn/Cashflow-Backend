export type IReportFormat = 'pdf' | 'excel' | 'csv';

export type IReportFilter = {
  startDate?: string;
  endDate?: string;
  format?: IReportFormat;
};

export type ICategoryBreakdown = {
  category: string;
  total: number;
  percentage: number;
};

export type IReportData = {
  summary: {
    totalIncome: number;
    totalExpense: number;
    savings: number;
  };
  incomeBreakdown: ICategoryBreakdown[];
  expenseBreakdown: ICategoryBreakdown[];
  user: {
    name: string;
    email: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  generatedDate: string;
};
