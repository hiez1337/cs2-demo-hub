/**
 * High-speed parallel Range downloader & Cloudflare R2 uploader for Chrome Extension
 */

export class StreamUploader {
  /**
   * Скачивает демо с серверов Backblaze/FACEIT параллельными потоками (HTTP Range)
   * @param {string} url
   * @param {Function} [onProgress]
   * @param {AbortSignal} [signal]
   * @param {number} [concurrency=4]
   * @returns {Promise<Uint8Array|null>}
   */
  static async downloadDemoParallel(url, onProgress = null, signal = null, concurrency = 4) {
    try {
      const probe = await fetch(url, { headers: { 'Range': 'bytes=0-0' }, signal });

      // Если Range не поддерживается, качаем обычным потоком
      if (probe.status !== 206) {
        const full = await fetch(url, { signal });
        if (!full.ok) return null;
        const ab = await full.arrayBuffer();
        return new Uint8Array(ab);
      }

      const cr = probe.headers.get('content-range');
      const totalSize = cr ? parseInt(cr.split('/')[1], 10) : 0;
      if (!totalSize || isNaN(totalSize)) {
        const full = await fetch(url, { signal });
        return full.ok ? new Uint8Array(await full.arrayBuffer()) : null;
      }

      const result = new Uint8Array(totalSize);
      const chunkSize = 8 * 1024 * 1024; // 8 МБ
      const totalChunks = Math.ceil(totalSize / chunkSize);

      let chunkIndex = 0;
      let downloadedBytes = 0;
      const startTime = Date.now();

      const workers = Array.from({ length: Math.min(concurrency, 6) }, async () => {
        while (chunkIndex < totalChunks) {
          if (signal && signal.aborted) throw new Error('Загрузка отменена');
          const current = chunkIndex++;
          const start = current * chunkSize;
          const end = Math.min(start + chunkSize - 1, totalSize - 1);

          let attempt = 0;
          while (attempt < 3) {
            try {
              const res = await fetch(url, {
                headers: { 'Range': `bytes=${start}-${end}` },
                signal,
              });
              if (res.status !== 206) throw new Error(`HTTP ${res.status}`);
              const ab = await res.arrayBuffer();
              result.set(new Uint8Array(ab), start);
              downloadedBytes += ab.byteLength;

              if (onProgress) {
                const elapsedSec = (Date.now() - startTime) / 1000;
                const speedMb = elapsedSec > 0 ? ((downloadedBytes / (1024 * 1024)) / elapsedSec).toFixed(1) : '0';
                const percent = Math.round((downloadedBytes / totalSize) * 100);
                onProgress({ percent, speedMb, downloadedBytes, totalSize });
              }
              break;
            } catch (err) {
              if (signal && signal.aborted) throw err;
              attempt++;
              if (attempt >= 3) throw err;
              await new Promise(r => setTimeout(r, 600 * attempt));
            }
          }
        }
      });

      await Promise.all(workers);
      return result;
    } catch (e) {
      console.error('[StreamUploader] Ошибка параллельного скачивания:', e);
      return null;
    }
  }

  /**
   * Загружает буфер чанками по 10 МБ в Cloudflare R2 через Presigned URL
   * @param {Uint8Array} fileBuffer
   * @param {string} token
   * @param {import('./csrep-api.js').CsrepApiClient} csrepClient
   * @param {Function} [onProgress]
   * @param {AbortSignal} [signal]
   * @param {number} [concurrency=4]
   */
  static async uploadChunksToR2(fileBuffer, token, csrepClient, onProgress = null, signal = null, concurrency = 4) {
    const partSize = 10 * 1024 * 1024; // 10 МБ
    const partCount = Math.ceil(fileBuffer.length / partSize);
    let completedParts = 0;
    const startTime = Date.now();
    let partIndex = 1;

    const workers = Array.from({ length: concurrency }, async () => {
      while (partIndex <= partCount) {
        if (signal && signal.aborted) throw new Error('Загрузка отменена');
        const p = partIndex++;
        const start = (p - 1) * partSize;
        const end = Math.min(start + partSize, fileBuffer.length);
        const chunk = fileBuffer.subarray(start, end);

        let presignUrl = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            presignUrl = await csrepClient.getPresignedUrl(token, p);
            if (presignUrl) break;
          } catch (e) {
            await new Promise(r => setTimeout(r, 800));
          }
        }

        if (!presignUrl) throw new Error(`Не получен presigned URL для части ${p}`);

        let uploaded = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const putRes = await fetch(presignUrl, {
              method: 'PUT',
              body: chunk,
              signal,
            });
            if (putRes.ok) {
              uploaded = true;
              break;
            }
          } catch (e) {
            if (signal && signal.aborted) throw e;
          }
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }

        if (!uploaded) throw new Error(`Не удалось загрузить часть ${p} в R2`);

        completedParts++;
        if (onProgress) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedMb = elapsedSec > 0 ? ((completedParts * 10) / elapsedSec).toFixed(1) : '0';
          const percent = Math.round((completedParts / partCount) * 100);
          onProgress({ percent, speedMb, completedParts, totalParts: partCount });
        }
      }
    });

    await Promise.all(workers);
  }
}
