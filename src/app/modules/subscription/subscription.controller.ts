import {
  Environment,
  NotificationHistoryRequest,
} from '@apple/app-store-server-library';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { SubscriptionService } from './subscription.service';

const verifyPurchase = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.verifyPurchase(
    (req.user as JwtPayload).id,
    req.body,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple subscription verified successfully',
    data: result,
  });
});

const getStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.getStatus(
    (req.user as JwtPayload).id,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Subscription status retrieved successfully',
    data: result,
  });
});

const restorePurchase = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.restorePurchase(
    (req.user as JwtPayload).id,
    req.body.originalTransactionId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple subscription restored successfully',
    data: result,
  });
});

const getHistory = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.getAppleHistory(
    (req.user as JwtPayload).id,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple subscription history retrieved successfully',
    data: result,
  });
});

const webhook = catchAsync(async (req: Request, res: Response) => {
  await SubscriptionService.processWebhook(req.body.signedPayload);
  res.sendStatus(StatusCodes.OK);
});

const notificationTest = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.requestNotificationTest(
    req.body.environment as Environment,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple test notification requested',
    data: result,
  });
});

const notificationHistory = catchAsync(async (req: Request, res: Response) => {
  const { environment, paginationToken, ...historyRequest } = req.body;
  const result = await SubscriptionService.getNotificationHistory(
    environment as Environment,
    historyRequest as NotificationHistoryRequest,
    paginationToken || null,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple notification history retrieved',
    data: result,
  });
});

const notificationDetails = catchAsync(async (req: Request, res: Response) => {
  const result = await SubscriptionService.getNotificationDetails(
    req.params.notificationId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Apple notification details retrieved',
    data: result,
  });
});

export const SubscriptionController = {
  verifyPurchase,
  getStatus,
  restorePurchase,
  getHistory,
  webhook,
  notificationTest,
  notificationHistory,
  notificationDetails,
};
