/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from 'zod';

export type IOcrResult = {
  amount: number | null;
  category: string | null;
  date: string | null;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
};

export type IConfirmedExpense = {
  amount: number;
  category: string;
  date: string;
  description?: string;
  fileUrl: string;
  fileName: string;
};
