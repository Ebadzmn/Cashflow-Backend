/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { AuditRiskService } from './auditRisk.service';

const getAuditRiskCount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await AuditRiskService.getAuditRiskCountFromDB(user);

  sendResponse(res, {
    success: true,
    statusCode: StatusCodes.OK,
    message: 'Audit risk count retrieved successfully',
    data: result,
  });
});

export const AuditRiskController = {
  getAuditRiskCount,
};
