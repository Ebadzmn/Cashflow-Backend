import nodemailer from 'nodemailer';
import config from '../config';
import { errorLogger, logger } from '../shared/logger';
import { ISendEmail } from '../types/email';

const BRAND_NAME = 'CashFlowIQ';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: Number(config.email.port),
  secure: Number(config.email.port) === 465,
  requireTLS: Number(config.email.port) !== 465,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
  tls: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
});

const sendEmail = async (values: ISendEmail) => {
  if (
    /[\r\n]/.test(values.to) ||
    /[\r\n]/.test(values.subject) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.to)
  ) {
    throw new Error('Email recipient or subject is invalid');
  }

  try {
    await transporter.sendMail({
      from: `"${BRAND_NAME}" ${config.email.from}`,
      to: values.to,
      subject: values.subject,
      html: values.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    logger.info('Email delivered to the configured transport');
  } catch (error) {
    errorLogger.error('Email', error);
    throw error;
  }
};

export const emailHelper = {
  sendEmail,
};
