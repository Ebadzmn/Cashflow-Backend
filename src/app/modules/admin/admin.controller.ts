import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { AdminService } from './admin.service';
import { JwtPayload } from 'jsonwebtoken';

const getDashboardData = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getDashboardData();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Dashboard data retrieved successfully',
    data: result,
  });
});

const getAllSubscribers = catchAsync(async (req: Request, res: Response) => {
  const { result, pagination } = await AdminService.getAllSubscribers(
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Subscribers retrieved successfully',
    pagination,
    data: result,
  });
});

const getMonthlyRevenue = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminService.getMonthlyRevenue();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Monthly revenue retrieved successfully',
    data: result,
  });
});

const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.deleteAccount(req.user as JwtPayload, id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
  });
});

const updateUser = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await AdminService.updateUser(
    req.user as JwtPayload,
    id,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'User updated successfully',
    data: result,
  });
});

export const AdminController = {
  getDashboardData,
  getAllSubscribers,
  getMonthlyRevenue,
  deleteAccount,
  updateUser,
};
