/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import ApiError from '../../../errors/ApiError';
import { Income } from '../income/income.model';
import { Expense } from '../expense/expense.model';
import { User } from '../user/user.model';
import { IReportData, IReportFilter } from './report.interface';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';
import { Response } from 'express';

const getReportData = async (
  user: JwtPayload,
  filters: IReportFilter,
): Promise<IReportData> => {
  const userId = new Types.ObjectId(user.id);
  let startDate: Date;

  if (filters.startDate) {
    startDate = new Date(filters.startDate);
  } else {
    // Find the earliest transaction date (Income or Expense)
    const [earliestIncome, earliestExpense] = await Promise.all([
      Income.findOne({ user: userId }).sort({ date: 1 }).select('date'),
      Expense.findOne({ user: userId }).sort({ date: 1 }).select('date'),
    ]);

    const dates = [earliestIncome?.date, earliestExpense?.date].filter(
      Boolean,
    ) as Date[];

    startDate =
      dates.length > 0
        ? new Date(Math.min(...dates.map(d => d.getTime())))
        : new Date(0);
  }

  const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid report date range');
  }
  if (filters.endDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)) {
    endDate.setUTCHours(23, 59, 59, 999);
  }
  if (startDate > endDate) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Start date must be before or equal to end date',
    );
  }

  const userData = await User.findById(userId);
  if (!userData) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const totalsPipeline = [
    {
      $match: {
        user: userId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
      },
    },
  ];
  const [incomeAggregation, expenseAggregation] = await Promise.all([
    Income.aggregate(totalsPipeline),
    Expense.aggregate(totalsPipeline),
  ]);

  const totalIncome = incomeAggregation.reduce(
    (acc, curr) => acc + curr.total,
    0,
  );
  const totalExpense = expenseAggregation.reduce(
    (acc, curr) => acc + curr.total,
    0,
  );

  const incomeBreakdown = incomeAggregation.map(item => ({
    category: item._id,
    total: Number(item.total.toFixed(2)),
    percentage:
      totalIncome > 0
        ? Number(((item.total / totalIncome) * 100).toFixed(2))
        : 0,
  }));

  const expenseBreakdown = expenseAggregation.map(item => ({
    category: item._id || 'Uncategorized',
    total: Number(item.total.toFixed(2)),
    percentage:
      totalExpense > 0
        ? Number(((item.total / totalExpense) * 100).toFixed(2))
        : 0,
  }));

  return {
    summary: {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      savings: Number((totalIncome - totalExpense).toFixed(2)),
    },
    incomeBreakdown,
    expenseBreakdown,
    user: {
      name: userData.name,
      email: userData.email,
    },
    dateRange: {
      startDate: startDate.toDateString(),
      endDate: endDate.toDateString(),
    },
    generatedDate: new Date().toDateString(),
  };
};

const generatePDF = async (res: Response, data: IReportData) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');

  doc.pipe(res);

  // --- Header ---
  doc.fontSize(24).fillColor('#1A202C').text('CashFlowIQ', { align: 'left' });
  doc
    .fontSize(10)
    .fillColor('#718096')
    .text('Income & Expense Report', { align: 'left' });

  doc.moveUp(2);
  doc
    .fontSize(10)
    .fillColor('#1A202C')
    .text(data.user.name, { align: 'right' });
  doc
    .fontSize(10)
    .fillColor('#718096')
    .text(`Generated: ${data.generatedDate}`, { align: 'right' });
  doc.moveDown(1.5);

  // Horizontal Line
  doc
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .strokeColor('#E2E8F0')
    .lineWidth(1)
    .stroke();
  doc.moveDown(2);

  // --- Date Range Banner ---
  const dateRangeText = `Period: ${data.dateRange.startDate} - ${data.dateRange.endDate}`;
  doc
    .fontSize(10)
    .fillColor('#4A5568')
    .text(dateRangeText, { align: 'center' });
  doc.moveDown(2);

  // --- Summary Section (Modern Box Style) ---
  const startY = doc.y;
  const boxWidth = 150;
  const boxHeight = 60;
  const spacing = 15;

  // Total Income Box
  doc.roundedRect(50, startY, boxWidth, boxHeight, 8).fill('#F0FFF4');
  doc
    .fillColor('#22543D')
    .fontSize(10)
    .text('TOTAL INCOME', 65, startY + 15);
  doc.fontSize(14).text(`$${data.summary.totalIncome}`, 65, startY + 32);

  // Total Expense Box
  doc
    .roundedRect(50 + boxWidth + spacing, startY, boxWidth, boxHeight, 8)
    .fill('#FFF5F5');
  doc
    .fillColor('#742A2A')
    .fontSize(10)
    .text('TOTAL EXPENSE', 65 + boxWidth + spacing, startY + 15);
  doc
    .fontSize(14)
    .text(
      `$${data.summary.totalExpense}`,
      65 + boxWidth + spacing,
      startY + 32,
    );

  // Savings Box
  const savingsColor = data.summary.savings >= 0 ? '#EBF8FF' : '#FFF5F5';
  const savingsTextColor = data.summary.savings >= 0 ? '#2A4365' : '#742A2A';
  doc
    .roundedRect(50 + (boxWidth + spacing) * 2, startY, boxWidth, boxHeight, 8)
    .fill(savingsColor);
  doc
    .fillColor(savingsTextColor)
    .fontSize(10)
    .text('NET SAVINGS', 65 + (boxWidth + spacing) * 2, startY + 15);
  doc
    .fontSize(14)
    .text(
      `$${data.summary.savings}`,
      65 + (boxWidth + spacing) * 2,
      startY + 32,
    );

  doc.y = startY + boxHeight + 40;

  // --- Breakdown Sections ---
  const drawBreakdown = (title: string, items: any[], color: string) => {
    doc.fontSize(14).fillColor('#1A202C').text(title, { underline: false });
    doc.moveDown(0.5);
    doc
      .moveTo(doc.x, doc.y)
      .lineTo(doc.x + 150, doc.y)
      .strokeColor(color)
      .lineWidth(2)
      .stroke();
    doc.moveDown(1);

    if (items.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#718096')
        .text('No data available for this period.');
    } else {
      items.forEach(item => {
        const currentY = doc.y;
        doc.fontSize(10).fillColor('#2D3748').text(item.category, 50, currentY);
        doc.text(`$${item.total}`, 300, currentY);
        doc.fillColor('#718096').text(`${item.percentage}%`, 450, currentY);
        doc.moveDown(0.5);
        doc
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .strokeColor('#EDF2F7')
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.5);
      });
    }
    doc.moveDown(2);
  };

  drawBreakdown('Income Breakdown', data.incomeBreakdown, '#48BB78');
  drawBreakdown('Expense Breakdown', data.expenseBreakdown, '#F56565');

  doc.end();
};

const generateExcel = async (res: Response, data: IReportData) => {
  const workbook = new ExcelJS.Workbook();
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A202C' },
  };
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: 'FFFFFFFF' },
    size: 12,
  };
  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  // --- Summary Sheet ---
  const summarySheet = workbook.addWorksheet('Summary');

  // Main Title
  summarySheet.mergeCells('A1:B1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'CashFlowIQ - Summary Report';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1A202C' } };
  titleCell.alignment = { horizontal: 'center' };

  summarySheet.addRows([
    [], // Spacer
    ['Project', 'CashFlowIQ'],
    ['Name', data.user.name],
    ['Period Start', data.dateRange.startDate],
    ['Period End', data.dateRange.endDate],
    ['Generated Date', data.generatedDate],
    [], // Spacer
    ['Financial Summary'],
    ['Total Income', data.summary.totalIncome],
    ['Total Expense', data.summary.totalExpense],
    ['Net Savings', data.summary.savings],
  ]);

  // Style the Summary Sheet
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 30;

  // Style Info Rows
  [3, 4, 5, 6, 7].forEach(rowNum => {
    summarySheet.getRow(rowNum).getCell(1).font = { bold: true };
    summarySheet.getRow(rowNum).getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF7FAFC' },
    };
  });

  // Style Financial Summary Header
  const financialHeader = summarySheet.getRow(9);
  financialHeader.getCell(1).font = { bold: true, size: 12 };
  summarySheet.mergeCells('A9:B9');

  // Style Financial Data
  [10, 11, 12].forEach(rowNum => {
    const row = summarySheet.getRow(rowNum);
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = '"$"#,##0.00';
    if (rowNum === 12) {
      row.getCell(2).font = {
        bold: true,
        color: { argb: data.summary.savings >= 0 ? 'FF22543D' : 'FF742A2A' },
      };
    }
  });

  // --- Income Breakdown on Summary Sheet ---
  let currentRow = 14;
  summarySheet.getRow(currentRow).getCell(1).value = 'Income Breakdown';
  summarySheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  summarySheet.mergeCells(`A${currentRow}:B${currentRow}`);
  currentRow++;

  if (data.incomeBreakdown.length === 0) {
    summarySheet.getRow(currentRow).getCell(1).value =
      'No income data available.';
    summarySheet.getRow(currentRow).getCell(1).font = { italic: true };
    currentRow++;
  } else {
    data.incomeBreakdown.forEach(item => {
      summarySheet.getRow(currentRow).getCell(1).value = item.category;
      summarySheet.getRow(currentRow).getCell(2).value = item.total;
      summarySheet.getRow(currentRow).getCell(2).numFmt = '"$"#,##0.00';
      currentRow++;
    });
  }
  currentRow++; // Spacer

  // --- Expense Breakdown on Summary Sheet ---
  summarySheet.getRow(currentRow).getCell(1).value = 'Expense Breakdown';
  summarySheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  summarySheet.mergeCells(`A${currentRow}:B${currentRow}`);
  currentRow++;

  if (data.expenseBreakdown.length === 0) {
    summarySheet.getRow(currentRow).getCell(1).value =
      'No expense data available.';
    summarySheet.getRow(currentRow).getCell(1).font = { italic: true };
    currentRow++;
  } else {
    data.expenseBreakdown.forEach(item => {
      summarySheet.getRow(currentRow).getCell(1).value = item.category;
      summarySheet.getRow(currentRow).getCell(2).value = item.total;
      summarySheet.getRow(currentRow).getCell(2).numFmt = '"$"#,##0.00';
      currentRow++;
    });
  }

  // --- Income Breakdown Sheet ---
  const incomeSheet = workbook.addWorksheet('Income Breakdown');
  incomeSheet.columns = [
    { header: 'Category', key: 'category', width: 35 },
    { header: 'Total Amount ($)', key: 'total', width: 20 },
    { header: 'Percentage (%)', key: 'percentage', width: 20 },
  ];

  incomeSheet.addRows(data.incomeBreakdown);

  // Style Header
  const incomeHeader = incomeSheet.getRow(1);
  incomeHeader.eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = borderStyle;
    cell.alignment = { horizontal: 'center' };
  });

  // Style Data Rows
  incomeSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.getCell(2).numFmt = '"$"#,##0.00';
      row.getCell(3).numFmt = '0.00"%"';
      row.eachCell(cell => {
        cell.border = borderStyle;
      });
    }
  });

  // --- Expense Breakdown Sheet ---
  const expenseSheet = workbook.addWorksheet('Expense Breakdown');
  expenseSheet.columns = [
    { header: 'Category', key: 'category', width: 35 },
    { header: 'Total Amount ($)', key: 'total', width: 20 },
    { header: 'Percentage (%)', key: 'percentage', width: 20 },
  ];

  expenseSheet.addRows(data.expenseBreakdown);

  // Style Header
  const expenseHeader = expenseSheet.getRow(1);
  expenseHeader.eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = borderStyle;
    cell.alignment = { horizontal: 'center' };
  });

  // Style Data Rows
  expenseSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.getCell(2).numFmt = '"$"#,##0.00';
      row.getCell(3).numFmt = '0.00"%"';
      row.eachCell(cell => {
        cell.border = borderStyle;
      });
    }
  });

  // Send the file
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');

  await workbook.xlsx.write(res);
  res.end();
};

const generateCSV = async (res: Response, data: IReportData) => {
  const fields = ['type', 'category', 'amount', 'percentage'];
  const csvData: Record<string, string | number | undefined>[] = [];

  // Add Summary Rows
  csvData.push({ type: 'HEADER', category: 'Project', amount: 'CashFlowIQ' });
  csvData.push({ type: 'HEADER', category: 'Name', amount: data.user.name });
  csvData.push({
    type: 'HEADER',
    category: 'Date Range',
    amount: `${data.dateRange.startDate} - ${data.dateRange.endDate}`,
  });
  csvData.push({
    type: 'HEADER',
    category: 'Generated At',
    amount: data.generatedDate,
  });
  csvData.push({});
  csvData.push({
    type: 'SUMMARY',
    category: 'Total Income',
    amount: data.summary.totalIncome,
  });
  csvData.push({
    type: 'SUMMARY',
    category: 'Total Expense',
    amount: data.summary.totalExpense,
  });
  csvData.push({
    type: 'SUMMARY',
    category: 'Total Savings',
    amount: data.summary.savings,
  });
  csvData.push({});

  // Add Income Rows
  csvData.push({
    type: 'INCOME_SECTION',
    category: 'Category',
    amount: 'Total ($)',
    percentage: 'Percentage (%)',
  });
  data.incomeBreakdown.forEach(item => {
    csvData.push({
      type: 'INCOME',
      category: item.category,
      amount: item.total,
      percentage: item.percentage,
    });
  });
  csvData.push({});

  // Add Expense Rows
  csvData.push({
    type: 'EXPENSE_SECTION',
    category: 'Category',
    amount: 'Total ($)',
    percentage: 'Percentage (%)',
  });
  data.expenseBreakdown.forEach(item => {
    csvData.push({
      type: 'EXPENSE',
      category: item.category,
      amount: item.total,
      percentage: item.percentage,
    });
  });

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(csvData);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=report.csv');
  res.status(StatusCodes.OK).send(csv);
};

export const ReportService = {
  getReportData,
  generatePDF,
  generateExcel,
  generateCSV,
};
