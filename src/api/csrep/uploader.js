import { generateCsrepHeaders, buildCsrepAuthHeaders } from '../../domain/csrep-crypto.js';

export class CsrepUploader {
  constructor(options = {}) {
    this.evaluateFn = options.evaluateFn || null;
  }

  /**
   * Инициализирует multipart сессию загрузки на csrep.gg
   * @param {import('playwright').Page|null} pageCsrep
   * @param {string} filename
   * @param {number} size
   * @returns {Promise<{ token: string, fileId: string }>}
   */
  async initMultipartUpload(pageCsrep, filename, size) {
    const evaluator =
      pageCsrep && typeof pageCsrep.evaluate === 'function'
        ? pageCsrep.evaluate.bind(pageCsrep)
        : this.evaluateFn;

    if (!evaluator) {
      return this.initMultipartDirect(pageCsrep, filename, size);
    }
    return await evaluator(async ({ filename, size }) => {
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
      const contentType = res.headers?.get ? res.headers.get('content-type') : (res.headers && res.headers['content-type']) || '';
      if (contentType && !contentType.includes('application/json')) {
        const text = await res.text();
        if (res.status === 401 || res.status === 403) {
          throw new Error('Требуется авторизация в CSREP (войдите через Steam)');
        }
        throw new Error(`CSREP HTTP ${res.status}: ${text.slice(0, 100)}`);
      }

      const data = await res.json();
      if (!res.ok || !data.result) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Требуется авторизация в CSREP (войдите через Steam)');
        }
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
    const evaluator =
      pageCsrep && typeof pageCsrep.evaluate === 'function'
        ? pageCsrep.evaluate.bind(pageCsrep)
        : this.evaluateFn;
    if (!evaluator) {
      return this.getPresignedUrlDirect(token, partNumber, typeof pageCsrep === 'string' ? pageCsrep : null);
    }
    return await evaluator(async ({ token, partNumber }) => {
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
      const contentType = res.headers?.get ? res.headers.get('content-type') : (res.headers && res.headers['content-type']) || '';
      if (contentType && !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`CSREP presign HTTP ${res.status}: ${text.slice(0, 100)}`);
      }

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
    const evaluator =
      pageCsrep && typeof pageCsrep.evaluate === 'function'
        ? pageCsrep.evaluate.bind(pageCsrep)
        : this.evaluateFn;
    if (!evaluator) {
      return this.completeUploadAndLinkDirect(token, csrepMatchId, fileId, typeof pageCsrep === 'string' ? pageCsrep : null);
    }
    return await evaluator(async ({ token, csrepMatchId, fileId }) => {
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
      const compType = compRes.headers?.get ? compRes.headers.get('content-type') : (compRes.headers && compRes.headers['content-type']) || '';
      let compJson = {};
      if (!compType || compType.includes('application/json')) {
        try {
          compJson = await compRes.json();
        } catch {}
      }
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

  /**
   * Инициализирует multipart сессию загрузки напрямую через HTTP без Playwright
   * @param {string} arg1 Token (sessionToken) OR filename
   * @param {string|number} arg2 Filename OR size
   * @param {number|string} [arg3] Size OR sessionToken
   * @returns {Promise<{ token: string, fileId: string }>}
   */
  async initMultipartDirect(arg1, arg2, arg3) {
    let sessionToken, filename, size;
    if (typeof arg2 === 'number') {
      filename = arg1;
      size = arg2;
      sessionToken = arg3 || null;
    } else {
      sessionToken = arg1 || null;
      filename = arg2;
      size = arg3;
    }

    if (typeof this.evaluateFn === 'function') {
      return this.initMultipartUpload(null, filename, size);
    }

    const headers = buildCsrepAuthHeaders(sessionToken, {
      'Content-Type': 'application/json',
    });

    const res = await fetch('https://csrep.gg/api/uploads/demos', {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename, size }),
    });

    const contentType = res.headers?.get ? res.headers.get('content-type') : (res.headers && res.headers['content-type']) || '';
    if (contentType && !contentType.includes('application/json')) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error('Требуется авторизация в CSREP (войдите через Steam)');
      }
      throw new Error(`CSREP HTTP ${res.status}: ${text.slice(0, 100)}`);
    }

    const data = await res.json();
    if (!res.ok || !data.result) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Требуется авторизация в CSREP (войдите через Steam)');
      }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return {
      token: data.result.token,
      fileId: data.result.file ? data.result.file.id : null,
    };
  }

  /**
   * Получает Presigned URL напрямую через HTTP
   * @param {string} token Multipart upload token
   * @param {number} partNumber
   * @param {string|null} [sessionToken]
   * @returns {Promise<string>}
   */
  async getPresignedUrlDirect(token, partNumber, sessionToken = null) {
    if (typeof this.evaluateFn === 'function') {
      return this.getPresignedUrl(null, token, partNumber);
    }

    const headers = buildCsrepAuthHeaders(sessionToken, {
      'Content-Type': 'application/json',
    });

    const res = await fetch('https://csrep.gg/api/uploads/_presign', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token, part_number: partNumber }),
    });

    const contentType = res.headers?.get ? res.headers.get('content-type') : (res.headers && res.headers['content-type']) || '';
    if (contentType && !contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`CSREP presign HTTP ${res.status}: ${text.slice(0, 100)}`);
    }

    const data = await res.json();
    return data.result || data.url;
  }

  /**
   * Завершает multipart загрузку и привязывает файл напрямую через HTTP
   * @param {string} token Multipart upload token
   * @param {string} csrepMatchId
   * @param {string} fileId
   * @param {string|null} [sessionToken]
   * @returns {Promise<string>}
   */
  async completeUploadAndLinkDirect(token, csrepMatchId, fileId, sessionToken = null) {
    if (typeof this.evaluateFn === 'function') {
      return this.completeUploadAndLink(null, token, csrepMatchId, fileId);
    }

    const headers = buildCsrepAuthHeaders(sessionToken, {
      'Content-Type': 'application/json',
    });

    // 1. Завершение multipart загрузки
    const compRes = await fetch('https://csrep.gg/api/uploads/_complete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });

    const compType = compRes.headers?.get ? compRes.headers.get('content-type') : (compRes.headers && compRes.headers['content-type']) || '';
    let compJson = {};
    if (!compType || compType.includes('application/json')) {
      try {
        compJson = await compRes.json();
      } catch {}
    }
    const finalFileId = compJson.result?.id || fileId;

    // 2. Привязка файла к матчу
    const linkHeaders = buildCsrepAuthHeaders(sessionToken, {
      'Content-Type': 'application/json',
    });
    await fetch(`https://csrep.gg/api/matches/${csrepMatchId}`, {
      method: 'POST',
      headers: linkHeaders,
      body: JSON.stringify({ demo_url: `file://${finalFileId}` }),
    });

    return finalFileId;
  }

  async completeAndLinkDirect(token, csrepMatchId, fileId, sessionToken = null) {
    return this.completeUploadAndLinkDirect(token, csrepMatchId, fileId, sessionToken);
  }
}
