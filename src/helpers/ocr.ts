/* eslint-disable no-undef */
import { StatusCodes } from 'http-status-codes';
import Tesseract from 'tesseract.js';
import config from '../config';
import ApiError from '../errors/ApiError';
import { normalizeImageForOCR } from './ocrImage';

const MAX_CONCURRENT_OCR_JOBS = 2;
const MAX_QUEUED_OCR_JOBS = 20;

type Worker = Awaited<ReturnType<typeof Tesseract.createWorker>>;
type Waiter = {
  resolve: (slot: number) => void;
  reject: (error: Error) => void;
};

const workerPromises: Array<Promise<Worker> | undefined> = Array(
  MAX_CONCURRENT_OCR_JOBS,
).fill(undefined);
const availableSlots = Array.from(
  { length: MAX_CONCURRENT_OCR_JOBS },
  (_, index) => index,
);
const waitingJobs: Waiter[] = [];

const workerForSlot = (slot: number) => {
  if (!workerPromises[slot]) {
    workerPromises[slot] = Tesseract.createWorker('eng', undefined, {
      langPath: config.ocr.languageDataPath,
      gzip: false,
    }).catch(error => {
      workerPromises[slot] = undefined;
      throw error;
    });
  }
  return workerPromises[slot]!;
};

const acquireSlot = async () => {
  const available = availableSlots.shift();
  if (available !== undefined) return available;
  if (waitingJobs.length >= MAX_QUEUED_OCR_JOBS) {
    throw new ApiError(
      StatusCodes.TOO_MANY_REQUESTS,
      'OCR is busy. Please try again shortly.',
    );
  }
  return new Promise<number>((resolve, reject) => {
    waitingJobs.push({ resolve, reject });
  });
};

const releaseSlot = (slot: number) => {
  const nextJob = waitingJobs.shift();
  if (nextJob) {
    nextJob.resolve(slot);
    return;
  }
  availableSlots.push(slot);
};

export const recognizeImageText = async (
  input: Buffer | string,
  mimeType?: string,
) => {
  const slot = await acquireSlot();
  try {
    const normalizedInput = Buffer.isBuffer(input)
      ? await normalizeImageForOCR(input, mimeType)
      : input;

    try {
      const worker = await workerForSlot(slot);
      const {
        data: { text },
      } = await worker.recognize(normalizedInput);
      return text;
    } catch (error) {
      const worker = await workerPromises[slot]?.catch(() => undefined);
      await worker?.terminate().catch(() => undefined);
      workerPromises[slot] = undefined;
      throw error;
    }
  } finally {
    releaseSlot(slot);
  }
};

export const shutdownOCRWorkers = async () => {
  const shutdownError = new Error('OCR service is shutting down');
  waitingJobs.splice(0).forEach(waiter => waiter.reject(shutdownError));
  const workers = await Promise.all(
    workerPromises.map(worker => worker?.catch(() => undefined)),
  );
  await Promise.all(workers.map(worker => worker?.terminate()));
  workerPromises.fill(undefined);
  availableSlots.splice(
    0,
    availableSlots.length,
    ...Array.from({ length: MAX_CONCURRENT_OCR_JOBS }, (_, index) => index),
  );
};

export const OCR_CONCURRENCY_LIMIT = MAX_CONCURRENT_OCR_JOBS;
