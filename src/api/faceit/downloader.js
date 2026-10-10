import fs from 'fs';
import path from 'path';

export class FaceitDownloader {
  constructor(apiClient, tempDir = './demos_temp', concurrency = 6) {
    this.apiClient = apiClient;
    this.tempDir = path.resolve(tempDir);
    this.concurrency = concurrency;
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  /**
   * Скачивает демо с FACEIT в оперативную память на максимальной скорости (параллельные потоки)
   * @param {Object} match
   * @param {import('playwright').Page} pageFaceit
   * @param {Function} [onProgress]
   * @param {AbortSignal} [signal]
   * @returns {Promise<Buffer|null>}
   */
  async downloadDemo(match, pageFaceit, onProgress = null, signal = null) {
    if (!match || !match.faceitMatchId) return null;
    const fId = match.faceitMatchId;

    let downloadUrl = null;

    // 1. Попытка перехватить прямую ссылку через кнопку на странице комнаты матча
    if (pageFaceit) {
      try {
        await pageFaceit.goto(`https://www.faceit.com/ru/cs2/room/${fId}`, { waitUntil: 'domcontentloaded' });
        await pageFaceit.waitForTimeout(2500);

        const btnSelector = 'button:has-text("Смотреть демо"), button:has-text("Watch demo"), button:has-text("Скачать демо"), button:has-text("Download demo")';
        const btn = await pageFaceit.$(btnSelector);

        if (btn) {
          const downloadPromise = new Promise((resolve) => {
            const handler = async (d) => {
              pageFaceit.off('download', handler);
              const url = d.url();
              await d.cancel().catch(() => {});
              resolve(url);
            };
            pageFaceit.on('download', handler);
            setTimeout(() => {
              pageFaceit.off('download', handler);
              resolve(null);
            }, 10000);
          });

          await btn.click();
          downloadUrl = await downloadPromise;
        }
      } catch {}
    }

    // 2. Если ссылка перехвачена, скачиваем её на полной скорости через параллельные Range-потоки в RAM
    if (downloadUrl) {
      const buffer = await this.downloadParallel(downloadUrl, onProgress, signal);
      if (buffer && buffer.length > 0) return buffer;
    }

    // 3. Резервный метод: скачивание через Open API
    const details = await this.apiClient?.getMatchDetails?.(fId);
    const rawDemoUrl = this.apiClient?.extractDemoUrl?.(details);

    if (rawDemoUrl && pageFaceit) {
      try {
        const signedUrl = await pageFaceit.evaluate(async (rawUrl) => {
          const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'faceit-referer': 'web-next',
            },
            body: JSON.stringify({ resource_url: rawUrl }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data?.payload?.download_url || null;
        }, rawDemoUrl);

        if (signedUrl) {
          const buffer = await this.downloadParallel(signedUrl, onProgress, signal);
          if (buffer && buffer.length > 0) return buffer;
        }
      } catch {}
    }

    return null;
  }

  /**
   * Скачивает файл по ссылке параллельными чанками по HTTP Range
   * @param {string} url
   * @param {Function} [onProgress]
   * @param {AbortSignal} [signal]
   * @returns {Promise<Buffer|null>}
   */
  async downloadParallel(url, onProgress = null, signal = null) {
    try {
      // Проверяем поддержку Range и узнаем размер файла
      const probe = await fetch(url, { headers: { 'Range': 'bytes=0-0' }, signal });
      
      // Если сервер не поддерживает Range (отдал 200 вместо 206), скачиваем обычным стримом
      if (probe.status !== 206) {
        const fullRes = await fetch(url, { signal });
        if (!fullRes.ok) return null;
        const arrayBuf = await fullRes.arrayBuffer();
        return Buffer.from(arrayBuf);
      }

      const cr = probe.headers.get('content-range'); // "bytes 0-0/149355173"
      const totalSize = cr ? parseInt(cr.split('/')[1], 10) : 0;

      if (!totalSize || isNaN(totalSize)) {
        const fullRes = await fetch(url, { signal });
        if (!fullRes.ok) return null;
        return Buffer.from(await fullRes.arrayBuffer());
      }

      const finalBuffer = Buffer.alloc(totalSize);
      const concurrency = Math.max(2, Math.min(this.concurrency || 6, 8));
      const chunkSize = 8 * 1024 * 1024; // Чанки по 8 МБ
      const totalChunks = Math.ceil(totalSize / chunkSize);

      let completedBytes = 0;
      const startTime = Date.now();
      let chunkIdx = 0;

      const workers = Array.from({ length: concurrency }, async () => {
        while (chunkIdx < totalChunks) {
          if (signal && signal.aborted) throw new Error('Загрузка отменена');
          const current = chunkIdx++;
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
              const chunkBuf = Buffer.from(ab);
              chunkBuf.copy(finalBuffer, start);
              completedBytes += chunkBuf.length;

              if (typeof onProgress === 'function') {
                const elapsedSec = (Date.now() - startTime) / 1000;
                const speedMb = elapsedSec > 0 ? ((completedBytes / (1024 * 1024)) / elapsedSec).toFixed(1) : '0';
                const percent = Math.round((completedBytes / totalSize) * 100);
                onProgress({ percent, speedMb, completedBytes, totalSize });
              }
              break;
            } catch (err) {
              if (signal && signal.aborted) throw err;
              attempt++;
              if (attempt >= 3) throw err;
              await new Promise(r => setTimeout(r, 800 * attempt));
            }
          }
        }
      });

      await Promise.all(workers);
      return finalBuffer;
    } catch (e) {
      console.warn(`[FaceitDownloader] Ошибка параллельного скачивания: ${e.message}`);
      return null;
    }
  }
}
