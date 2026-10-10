import fs from 'fs';
import path from 'path';
import { Agent as UndiciAgent } from 'undici';

let cachedAgent = null;
function getDownloadAgent() {
  if (!cachedAgent) {
    try {
      cachedAgent = new UndiciAgent({
        connections: 24,
        pipelining: 1,
        keepAliveTimeout: 60000,
        keepAliveMaxTimeout: 120000,
      });
    } catch {
      cachedAgent = null;
    }
  }
  return cachedAgent;
}

export class FaceitDownloader {
  constructor(apiClient, tempDir = './demos_temp', concurrency = 10, options = {}) {
    this.apiClient = apiClient;
    this.tempDir = path.resolve(tempDir);
    this.concurrency = concurrency || 10;
    this.chunkSize = options?.chunkSize || 4 * 1024 * 1024;
    this.signUrlFn = typeof options === 'function' ? options : (options?.signUrlFn || null);
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
  async downloadDemo(match, pageFaceit, onProgress = null, signal = null, faceitToken = null) {
    const fId = match?.faceitMatchId || match?.faceit_id || match?.id;
    if (!fId) return null;

    if (onProgress && typeof onProgress === 'function') {
      onProgress({ percent: 5, speedMb: 31.8 });
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (signal?.aborted) return null;

    let downloadUrl = null;
    // 1. Попытка перехватить прямую ссылку через кнопку на странице комнаты матча
    if (pageFaceit && typeof pageFaceit.goto === 'function') {
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

    if (rawDemoUrl) {
      let signedUrl = null;

      // 3a. Browser evaluate inside Playwright context
      if (pageFaceit && typeof pageFaceit.evaluate === 'function') {
        try {
          signedUrl = await pageFaceit.evaluate(async (rawUrl) => {
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
        } catch {}
      }

      // 3b. Signer function (e.g. Electron partition browser window session)
      if (!signedUrl && typeof this.signUrlFn === 'function') {
        try {
          signedUrl = await this.signUrlFn(rawDemoUrl, faceitToken);
        } catch {}
      }

      // 3c. Direct fetch signing fallback
      if (!signedUrl) {
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'faceit-referer': 'web-next',
          };
          if (faceitToken) {
            headers['Authorization'] = `Bearer ${faceitToken}`;
          }
          const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
            method: 'POST',
            headers,
            body: JSON.stringify({ resource_url: rawDemoUrl }),
          });
          if (res.ok) {
            const data = await res.json();
            signedUrl = data?.payload?.download_url || null;
          }
        } catch {}
      }

      if (signedUrl) {
        const buffer = await this.downloadParallel(signedUrl, onProgress, signal);
        if (buffer && buffer.length > 0) return buffer;
      }

      // Fallback: попытаться скачать rawDemoUrl напрямую если это валидный HTTP URL
      try {
        const buffer = await this.downloadParallel(rawDemoUrl, onProgress, signal);
        if (buffer && buffer.length > 0) return buffer;
      } catch {}
    }

    return null;
  }

  /**
   * Прямое скачивание демо без Playwright
   * @param {Object} match
   * @param {Function} [onProgress]
   * @param {AbortSignal} [signal]
   * @returns {Promise<Buffer|null>}
   */
  async downloadDemoDirect(match, onProgress = null, signal = null, faceitToken = null) {
    return this.downloadDemo(match, null, onProgress, signal, faceitToken);
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
      const agent = getDownloadAgent();
      // Проверяем поддержку Range и узнаем размер файла
      const probeOpts = { headers: { 'Range': 'bytes=0-0' }, signal };
      if (agent) probeOpts.dispatcher = agent;
      const probe = await fetch(url, probeOpts);
      
      // Если сервер не поддерживает Range (отдал 200 вместо 206), скачиваем обычным стримом
      if (probe.status !== 206) {
        const fullOpts = { signal };
        if (agent) fullOpts.dispatcher = agent;
        const fullRes = await fetch(url, fullOpts);
        if (!fullRes.ok) return null;
        const arrayBuf = await fullRes.arrayBuffer();
        return Buffer.from(arrayBuf);
      }

      const cr = probe.headers.get('content-range'); // "bytes 0-0/149355173"
      const totalSize = cr ? parseInt(cr.split('/')[1], 10) : 0;

      if (!totalSize || isNaN(totalSize)) {
        const fullOpts = { signal };
        if (agent) fullOpts.dispatcher = agent;
        const fullRes = await fetch(url, fullOpts);
        if (!fullRes.ok) return null;
        return Buffer.from(await fullRes.arrayBuffer());
      }

      const finalBuffer = Buffer.allocUnsafe(totalSize);
      const concurrency = Math.max(2, Math.min(this.concurrency || 10, 16));
      const chunkSize = this.chunkSize || 4 * 1024 * 1024; // Чанки по 4 МБ (оптимально для B2/Cloudflare RTT)
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
              const reqOpts = {
                headers: { 'Range': `bytes=${start}-${end}` },
                signal,
              };
              if (agent) reqOpts.dispatcher = agent;
              const res = await fetch(url, reqOpts);
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
              await new Promise(r => setTimeout(r, 400 * attempt));
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
