import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { PrivacyPolicyService } from './privacyPolicy.service';

const createPrivacyPolicy = catchAsync(async (req: Request, res: Response) => {
  const result = await PrivacyPolicyService.createPrivacyPolicy(req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Privacy Policy created successfully',
    data: result,
  });
});

const getAllPrivacyPolicies = catchAsync(
  async (req: Request, res: Response) => {
    const { result, pagination } =
      await PrivacyPolicyService.getAllPrivacyPolicies(req.query);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Privacy Policies retrieved successfully',
      pagination,
      data: result,
    });
  },
);

const getSinglePrivacyPolicy = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await PrivacyPolicyService.getSinglePrivacyPolicy(id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Privacy Policy retrieved successfully',
      data: result,
    });
  },
);

const updatePrivacyPolicy = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await PrivacyPolicyService.updatePrivacyPolicy(id, req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Privacy Policy updated successfully',
    data: result,
  });
});

const deletePrivacyPolicy = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await PrivacyPolicyService.deletePrivacyPolicy(id);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Privacy Policy deleted successfully',
    data: result,
  });
});

export const PrivacyPolicyController = {
  createPrivacyPolicy,
  getAllPrivacyPolicies,
  getSinglePrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
};
