export class ChunkWorkerPool {
  constructor(concurrency = 4, partSize = 10 * 1024 * 1024) {
    this.concurrency = concurrency;
    this.partSize = partSize;
  }

  async upload(fileBuffer, getPresignUrlFn, onProgressFn, signal = null) {
    if (signal && signal.aborted) throw new Error('Загрузка отменена');

    const totalSize = fileBuffer.length;
    const partCount = Math.ceil(totalSize / this.partSize);
    const partIndices = Array.from({ length: partCount }, (_, idx) => idx + 1);

    let completedChunks = 0;
    const startTime = Date.now();

    await this.pMap(partIndices, async (partNumber) => {
      if (signal && signal.aborted) throw new Error('Загрузка отменена');

      const start = (partNumber - 1) * this.partSize;
      const end = Math.min(start + this.partSize, totalSize);
      const chunk = fileBuffer.subarray(start, end);

      const presignUrl = await getPresignUrlFn(partNumber);
      if (!presignUrl) throw new Error(`Не получен URL для части ${partNumber}`);

      await this.uploadChunkWithRetry(presignUrl, chunk, 3, signal);

      completedChunks++;
      const percent = Math.round((completedChunks / partCount) * 100);
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMb = elapsedSec > 0 ? ((completedChunks * (this.partSize / (1024 * 1024))) / elapsedSec).toFixed(1) : '0';

      if (typeof onProgressFn === 'function') {
        onProgressFn({
          completedChunks,
          totalChunks: partCount,
          percent,
          speedMb,
        });
      }
    }, this.concurrency, signal);
  }

  async uploadChunkWithRetry(putUrl, chunk, maxRetries = 3, signal = null) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal && signal.aborted) throw new Error('Загрузка отменена');
      try {
        const res = await fetch(putUrl, {
          method: 'PUT',
          body: chunk,
          headers: { 'Content-Type': 'application/octet-stream' },
          signal,
        });
        if (res.ok) return true;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        if (signal && signal.aborted) throw new Error('Загрузка отменена');
        lastErr = e;
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
    throw lastErr;
  }

  async pMap(array, iterator, concurrency = 4, signal = null) {
    const results = new Array(array.length);
    let index = 0;
    const workerCount = Math.min(concurrency, array.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (index < array.length) {
        if (signal && signal.aborted) throw new Error('Загрузка отменена');
        const i = index++;
        results[i] = await iterator(array[i], i);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
