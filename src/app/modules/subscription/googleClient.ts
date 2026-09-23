import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { StatusCodes } from 'http-status-codes';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';

import { errorContext, errorLogger } from '../../../shared/logger';

const required = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      `Google subscription configuration is missing ${name}`,
    );
  }
  return value;
};

let cachedAuthClient: InstanceType<typeof google.auth.GoogleAuth> | undefined;

export const getGoogleAuth = () => {
  if (cachedAuthClient) return cachedAuthClient;

  const scopes = ['https://www.googleapis.com/auth/androidpublisher'];

  if (config.google.serviceAccountKey) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(config.google.serviceAccountKey);
    } catch {
      throw new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'GOOGLE_SERVICE_ACCOUNT_KEY must be a valid JSON string',
      );
    }
    cachedAuthClient = new google.auth.GoogleAuth({
      credentials,
      scopes,
    });
    return cachedAuthClient;
  }

  const keyPath = required(
    config.google.serviceAccountKeyPath,
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  );
  if (!fs.existsSync(path.resolve(keyPath))) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      `Google service account key file does not exist at ${keyPath}`,
    );
  }

  cachedAuthClient = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes,
  });
  return cachedAuthClient;
};

export const getGooglePlayClient = () => {
  const auth = getGoogleAuth();
  return google.androidpublisher({
    version: 'v3',
    auth,
  });
};

type ApiErrorWithResponse = {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
      };
    };
  };
  status?: number;
  message?: string;
};

export const getGoogleSubscriptionV2 = async (token: string) => {
  const packageName = required(
    config.google.packageName,
    'GOOGLE_PACKAGE_NAME',
  );
  const client = getGooglePlayClient();
  try {
    const response = await client.purchases.subscriptionsv2.get({
      packageName,
      token,
    });
    return response.data;
  } catch (error: unknown) {
    const err = error as ApiErrorWithResponse;
    const statusCode = err?.response?.status || err?.status;
    const errorMessage = err?.response?.data?.error?.message || err?.message;

    if (statusCode === StatusCodes.NOT_FOUND) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        'Google subscription was not found',
      );
    }
    if (
      statusCode === StatusCodes.UNAUTHORIZED ||
      statusCode === StatusCodes.FORBIDDEN
    ) {
      throw new ApiError(
        StatusCodes.SERVICE_UNAVAILABLE,
        'Google Play API rejected the configured Service Account credentials',
      );
    }
    throw new ApiError(
      StatusCodes.BAD_GATEWAY,
      errorMessage
        ? `Google Play Developer API request failed: ${errorMessage}`
        : 'Google Play Developer API request failed',
    );
  }
};

export const acknowledgeGoogleSubscription = async (
  subscriptionId: string,
  token: string,
) => {
  const packageName = required(
    config.google.packageName,
    'GOOGLE_PACKAGE_NAME',
  );
  const client = getGooglePlayClient();
  try {
    await client.purchases.subscriptions.acknowledge({
      packageName,
      subscriptionId,
      token,
      requestBody: {
        developerPayload: 'CashFlowIQ verified',
      },
    });
  } catch (error: unknown) {
    const err = error as ApiErrorWithResponse;
    const errorMessage = err?.response?.data?.error?.message || err?.message;
    if (errorMessage && errorMessage.includes('already been acknowledged')) {
      return;
    }
    errorLogger.error(
      'Failed to acknowledge Google subscription',
      errorContext(error),
    );
  }
};
