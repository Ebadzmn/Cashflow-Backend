import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import { ReportService } from './report.service';
import { IReportFilter } from './report.interface';
import { JwtPayload } from 'jsonwebtoken';

const generatePDF = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const filters: IReportFilter = req.query;
  const reportData = await ReportService.getReportData(user, filters);
  await ReportService.generatePDF(res, reportData);
});

const generateExcel = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const filters: IReportFilter = req.query;
  const reportData = await ReportService.getReportData(user, filters);
  await ReportService.generateExcel(res, reportData);
});

const generateCSV = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const filters: IReportFilter = req.query;
  const reportData = await ReportService.getReportData(user, filters);
  await ReportService.generateCSV(res, reportData);
});

export const ReportController = {
  generatePDF,
  generateExcel,
  generateCSV,
};
