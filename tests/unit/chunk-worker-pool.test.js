import { describe, it, expect, vi } from 'vitest';
import { ChunkWorkerPool } from '../../src/core/chunk-worker-pool.js';

describe('ChunkWorkerPool', () => {
  it('should split buffer into correct number of parts and upload', async () => {
    const partSize = 1024 * 1024;
    const pool = new ChunkWorkerPool(2, partSize);
    const buffer = Buffer.alloc(2.5 * 1024 * 1024, 'a');

    const requestedParts = [];
    const getPresignUrlFn = vi.fn(async (partNum) => {
      requestedParts.push(partNum);
      return `https://storage.example.com/part-${partNum}`;
    });

    const progressReports = [];
    const onProgressFn = vi.fn((prog) => {
      progressReports.push(prog);
    });

    vi.spyOn(pool, 'uploadChunkWithRetry').mockImplementation(async () => true);

    await pool.upload(buffer, getPresignUrlFn, onProgressFn);

    expect(requestedParts).toEqual([1, 2, 3]);
    expect(onProgressFn).toHaveBeenCalledTimes(3);
    expect(progressReports[progressReports.length - 1].percent).toBe(100);
  });

  it('should abort upload when signal is triggered', async () => {
    const pool = new ChunkWorkerPool(1, 1024);
    const buffer = Buffer.alloc(5000);

    const controller = new AbortController();
    controller.abort();

    await expect(
      pool.upload(buffer, async () => 'https://mock.url', () => {}, controller.signal)
    ).rejects.toThrow('Загрузка отменена');
  });

  it('should retry failed chunks up to maxRetries', async () => {
    const pool = new ChunkWorkerPool(1, 1024);

    let attempts = 0;
    globalThis.fetch = vi.fn(async () => {
      attempts++;
      if (attempts < 3) return { ok: false, status: 500 };
      return { ok: true, status: 200 };
    });

    const chunk = Buffer.from('test-chunk');
    const result = await pool.uploadChunkWithRetry('https://mock.url', chunk, 3);

    expect(result).toBe(true);
    expect(attempts).toBe(3);
  });
});
