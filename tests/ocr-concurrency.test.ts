/* eslint-disable no-undef, no-unused-vars */
jest.mock('tesseract.js', () => ({
  __esModule: true,
  default: { createWorker: jest.fn() },
}));

jest.mock('../src/helpers/ocrImage', () => ({
  normalizeImageForOCR: jest.fn(async (input: Buffer) => input),
}));

import Tesseract from 'tesseract.js';
import { normalizeImageForOCR } from '../src/helpers/ocrImage';
import {
  OCR_CONCURRENCY_LIMIT,
  recognizeImageText,
  shutdownOCRWorkers,
} from '../src/helpers/ocr';

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('OCR concurrency limit', () => {
  afterEach(async () => {
    await shutdownOCRWorkers();
  });

  it('reuses a bounded worker pool and terminates its workers on shutdown', async () => {
    const pendingRecognitions: Array<
      (value: { data: { text: string } }) => void
    > = [];
    let activeRecognitions = 0;
    let peakActiveRecognitions = 0;

    const workers = Array.from({ length: OCR_CONCURRENCY_LIMIT }, () => ({
      recognize: jest.fn(
        () =>
          new Promise<{ data: { text: string } }>(resolve => {
            activeRecognitions += 1;
            peakActiveRecognitions = Math.max(
              peakActiveRecognitions,
              activeRecognitions,
            );
            pendingRecognitions.push(resolve);
          }),
      ),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    let nextWorker = 0;

    (Tesseract.createWorker as jest.Mock).mockImplementation(async () => {
      const worker = workers[nextWorker];
      nextWorker += 1;
      return worker;
    });

    const jobCount = OCR_CONCURRENCY_LIMIT + 2;
    const jobs = Array.from({ length: jobCount }, (_, index) =>
      recognizeImageText(Buffer.from(String(index))),
    );

    await flushPromises();

    expect(Tesseract.createWorker).toHaveBeenCalledTimes(OCR_CONCURRENCY_LIMIT);
    expect(Tesseract.createWorker).toHaveBeenCalledWith('eng', undefined, {
      langPath: expect.any(String),
      gzip: false,
    });
    expect(
      workers.reduce(
        (total, worker) => total + worker.recognize.mock.calls.length,
        0,
      ),
    ).toBe(OCR_CONCURRENCY_LIMIT);
    expect(activeRecognitions).toBe(OCR_CONCURRENCY_LIMIT);
    expect(peakActiveRecognitions).toBe(OCR_CONCURRENCY_LIMIT);

    const finishNextRecognition = (text: string) => {
      const resolve = pendingRecognitions.shift();
      expect(resolve).toBeDefined();
      activeRecognitions -= 1;
      resolve?.({ data: { text } });
    };

    finishNextRecognition('first');
    await flushPromises();

    expect(
      workers.reduce(
        (total, worker) => total + worker.recognize.mock.calls.length,
        0,
      ),
    ).toBe(OCR_CONCURRENCY_LIMIT + 1);
    expect(activeRecognitions).toBe(OCR_CONCURRENCY_LIMIT);
    expect(peakActiveRecognitions).toBe(OCR_CONCURRENCY_LIMIT);

    for (let completed = 1; completed < jobCount; completed += 1) {
      finishNextRecognition(`result-${completed}`);
      await flushPromises();
    }

    await expect(Promise.all(jobs)).resolves.toHaveLength(jobCount);
    expect(activeRecognitions).toBe(0);
    expect(Tesseract.createWorker).toHaveBeenCalledTimes(OCR_CONCURRENCY_LIMIT);

    await shutdownOCRWorkers();

    workers.forEach(worker => {
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });
  });

  it('does not discard a healthy worker when image normalization fails', async () => {
    const workers = Array.from({ length: OCR_CONCURRENCY_LIMIT }, () => ({
      recognize: jest.fn().mockResolvedValue({ data: { text: 'receipt' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    }));
    let nextWorker = 0;
    (Tesseract.createWorker as jest.Mock).mockImplementation(async () => {
      const worker = workers[nextWorker];
      nextWorker += 1;
      return worker;
    });
    (normalizeImageForOCR as jest.Mock).mockImplementation(
      async (input: Buffer) => input,
    );

    await Promise.all([
      recognizeImageText(Buffer.from('first')),
      recognizeImageText(Buffer.from('second')),
    ]);

    (normalizeImageForOCR as jest.Mock).mockRejectedValueOnce(
      new Error('invalid image'),
    );
    await expect(recognizeImageText(Buffer.from('invalid'))).rejects.toThrow(
      'invalid image',
    );

    expect(Tesseract.createWorker).toHaveBeenCalledTimes(OCR_CONCURRENCY_LIMIT);
    workers.forEach(worker => {
      expect(worker.terminate).not.toHaveBeenCalled();
    });
  });
});
