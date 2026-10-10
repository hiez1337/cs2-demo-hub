import { generateCsrepHeaders } from '../../domain/csrep-crypto.js';

export class CsrepUploader {
  /**
   * Инициализирует multipart сессию загрузки на csrep.gg
   * @param {import('playwright').Page} pageCsrep
   * @param {string} filename
   * @param {number} size
   * @returns {Promise<{ token: string, fileId: string }>}
   */
  async initMultipartUpload(pageCsrep, filename, size) {
    return await pageCsrep.evaluate(async ({ filename, size }) => {
      const reqId = crypto.randomUUID();
      const timestamp = Date.now().toString();
      let hash = 0;
      const str = `${reqId}${timestamp}`;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
      }
      const secret = (hash >>> 0).toString(36);

      const res = await fetch('https://csrep.gg/api/uploads/demos', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Request-ID': reqId,
          'X-Request-Timestamp': timestamp,
          'X-Request-Secret': secret,
        },
        body: JSON.stringify({ filename, size }),
      });

      const data = await res.json();
      if (!res.ok || !data.result) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return {
        token: data.result.token,
        fileId: data.result.file ? data.result.file.id : null,
      };
    }, { filename, size });
  }

  /**
   * Получает Presigned URL для отдельной части multipart загрузки в Cloudflare R2
   * @param {import('playwright').Page} pageCsrep
   * @param {string} token
   * @param {number} partNumber
   * @returns {Promise<string>}
   */
  async getPresignedUrl(pageCsrep, token, partNumber) {
    return await pageCsrep.evaluate(async ({ token, partNumber }) => {
      const reqId = crypto.randomUUID();
      const timestamp = Date.now().toString();
      let hash = 0;
      const str = `${reqId}${timestamp}`;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
      }
      const secret = (hash >>> 0).toString(36);

      const res = await fetch('https://csrep.gg/api/uploads/_presign', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Request-ID': reqId,
          'X-Request-Timestamp': timestamp,
          'X-Request-Secret': secret,
        },
        body: JSON.stringify({ token, part_number: partNumber }),
      });

      const data = await res.json();
      return data.result || data.url;
    }, { token, partNumber });
  }

  /**
   * Завершает multipart загрузку и привязывает файл к матчу в csrep.gg
   * @param {import('playwright').Page} pageCsrep
   * @param {string} token
   * @param {string} csrepMatchId
   * @param {string} fileId
   * @returns {Promise<string>}
   */
  async completeUploadAndLink(pageCsrep, token, csrepMatchId, fileId) {
    return await pageCsrep.evaluate(async ({ token, csrepMatchId, fileId }) => {
      const reqId = crypto.randomUUID();
      const timestamp = Date.now().toString();
      let hash = 0;
      const str = `${reqId}${timestamp}`;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
      }
      const secret = (hash >>> 0).toString(36);

      // 1. Завершение multipart загрузки
      const compRes = await fetch('https://csrep.gg/api/uploads/_complete', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Request-ID': reqId,
          'X-Request-Timestamp': timestamp,
          'X-Request-Secret': secret,
        },
        body: JSON.stringify({ token }),
      });
      const compJson = await compRes.json();
      const finalFileId = compJson.result?.id || fileId;

      // 2. Привязка файла к матчу
      const reqId2 = crypto.randomUUID();
      const timestamp2 = Date.now().toString();
      let hash2 = 0;
      const str2 = `${reqId2}${timestamp2}`;
      for (let i = 0; i < str2.length; i++) {
        hash2 = (hash2 << 5) - hash2 + str2.charCodeAt(i) | 0;
      }
      const secret2 = (hash2 >>> 0).toString(36);

      await fetch(`https://csrep.gg/api/matches/${csrepMatchId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Request-ID': reqId2,
          'X-Request-Timestamp': timestamp2,
          'X-Request-Secret': secret2,
        },
        body: JSON.stringify({ demo_url: `file://${finalFileId}` }),
      });

      return finalFileId;
    }, { token, csrepMatchId, fileId });
  }
}
