import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { TermsAndConditionsService } from './termsAndConditions.service';

const createTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const result = await TermsAndConditionsService.createTermsAndConditions(
      req.body,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Terms and Conditions created successfully',
      data: result,
    });
  },
);

const getAllTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const { result, pagination } =
      await TermsAndConditionsService.getAllTermsAndConditions(req.query);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Terms and Conditions retrieved successfully',
      pagination,
      data: result,
    });
  },
);

const getSingleTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result =
      await TermsAndConditionsService.getSingleTermsAndConditions(id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Terms and Conditions retrieved successfully',
      data: result,
    });
  },
);

const updateTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await TermsAndConditionsService.updateTermsAndConditions(
      id,
      req.body,
    );
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Terms and Conditions updated successfully',
      data: result,
    });
  },
);

const deleteTermsAndConditions = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await TermsAndConditionsService.deleteTermsAndConditions(id);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: 'Terms and Conditions deleted successfully',
      data: result,
    });
  },
);

export const TermsAndConditionsController = {
  createTermsAndConditions,
  getAllTermsAndConditions,
  getSingleTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions,
};
