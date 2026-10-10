/**
 * CSREP API Client for Chrome Extension (Manifest V3)
 * Uses Tab Proxy Fetch (executes in the active csrep.gg tab context) with Service Worker fallback
 */

export function generateCsrepHeaders() {
  const reqId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  let hash = 0;
  const str = `${reqId}${timestamp}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
  }
  const secret = (hash >>> 0).toString(36);

  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'X-Request-ID': reqId,
    'X-Request-Timestamp': timestamp,
    'X-Request-Secret': secret,
  };
}

export class CsrepApiClient {
  /**
   * Выполняет сетевой запрос с приоритетом через активную вкладку csrep.gg (same-origin, 100% обход Cloudflare/CORS)
   */
  async fetchSafe(url, options = {}, logger = null) {
    // 1. Приоритет: выполнение fetch прямо внутри вкладки csrep.gg (100% обход Cloudflare Turnstile и CORS)
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const allTabs = await chrome.tabs.query({});
        const csrepTab = allTabs.find(t => t.url && t.url.includes('csrep.gg'));

        if (csrepTab && csrepTab.id) {
          // Способ A: через sendMessage в существующий content.js
          try {
            const sendRes = await new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('Timeout content script')), 3500);
              chrome.tabs.sendMessage(csrepTab.id, {
                type: 'PAGE_FETCH',
                url,
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body || null,
              }, (response) => {
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(response);
                }
              });
            });

            if (sendRes && (sendRes.ok || sendRes.status)) {
              return sendRes;
            }
          } catch (e) {}

          // Способ B: через прямой executeScript в контексте страницы csrep.gg
          if (chrome.scripting) {
            const results = await chrome.scripting.executeScript({
              target: { tabId: csrepTab.id },
              func: async (fetchUrl, method, headers, body) => {
                try {
                  const r = await fetch(fetchUrl, {
                    method,
                    headers,
                    body,
                    credentials: 'include',
                  });
                  const text = await r.text();
                  let json = null;
                  try { json = JSON.parse(text); } catch {}
                  return { ok: r.ok, status: r.status, statusText: r.statusText, json, text };
                } catch (e) {
                  return { ok: false, error: e.message };
                }
              },
              args: [url, options.method || 'GET', options.headers || {}, options.body || null],
            });

            if (results && results[0] && results[0].result) {
              const res = results[0].result;
              if (res.ok) {
                return res;
              }
              if (logger) {
                logger(`⚠️ Вкладка csrep.gg вернула HTTP ${res.status}: ${res.statusText || res.error || ''}`, 'warn');
              }
              return res;
            }
          }
        }
      }
    } catch (e) {
      if (logger) logger(`⚠️ Ошибка делегирования вкладке csrep: ${e.message}`, 'warn');
    }

    // 2. Резервный прямой fetch из Service Worker
    try {
      const res = await fetch(url, {
        ...options,
        credentials: 'include',
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (!res.ok && logger) {
        logger(`⚠️ Service Worker fetch вернул HTTP ${res.status}: ${res.statusText || ''}`, 'warn');
      }
      return { ok: res.ok, status: res.status, statusText: res.statusText, json, text };
    } catch (err) {
      if (logger) logger(`❌ Ошибка запроса: ${err.message}`, 'error');
      return { ok: false, error: err.message };
    }
  }

  /**
   * Сканирует страницы матчей на csrep.gg и находит недостающие демки
   * @param {string} steamId
   * @param {number} maxPages
   * @param {Function} [logger]
   * @returns {Promise<Array<{csrepMatchId: string, faceitMatchId: string, map: string, date: string, score: string}>>}
   */
  async getMissingMatches(steamId, maxPages = 3, logger = null) {
    const missing = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://csrep.gg/api/players/${encodeURIComponent(steamId)}/matches?page=${page}&limit=20&sort%5Bkey%5D=date&sort%5Bdirection%5D=desc`;
      if (logger) logger(`📡 Запрос страницы ${page}...`);

      const res = await this.fetchSafe(url, {
        method: 'GET',
        headers: generateCsrepHeaders(),
      }, logger);

      if (!res.ok) {
        if (logger) logger(`❌ Не удалось получить страницу ${page} (HTTP ${res.status || res.error})`, 'error');
        break;
      }

      const data = res.json || {};
      const matches = data.result || [];
      if (logger) logger(`📄 Страница ${page}: получено ${matches.length} матчей`);

      for (const m of matches) {
        if (m.source === 'FACEIT' && m.status === 'DEMO_MISSING' && m.source_id) {
          const scoreStr = Array.isArray(m.score) ? m.score.join(':') : (m.score || '');
          missing.push({
            csrepMatchId: m.id,
            faceitMatchId: m.source_id,
            map: m.map || 'unknown',
            date: m.date || '',
            score: scoreStr,
          });
        }
      }

      if (!data.pagination?.hasNextPage) break;
    }

    return missing;
  }

  /**
   * Инициализирует multipart сессию
   */
  async initMultipart(filename, size, logger = null) {
    const res = await this.fetchSafe('https://csrep.gg/api/uploads/demos', {
      method: 'POST',
      headers: generateCsrepHeaders(),
      body: JSON.stringify({ filename, size }),
    }, logger);

    const data = res.json;
    if (!res.ok || !data?.result) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }

    return {
      token: data.result.token,
      fileId: data.result.file ? data.result.file.id : null,
    };
  }

  /**
   * Получает Presigned URL для отдельной части загрузки
   */
  async getPresignedUrl(token, partNumber, logger = null) {
    const res = await this.fetchSafe('https://csrep.gg/api/uploads/_presign', {
      method: 'POST',
      headers: generateCsrepHeaders(),
      body: JSON.stringify({ token, part_number: partNumber }),
    }, logger);

    const data = res.json;
    return data?.result || data?.url;
  }

  /**
   * Завершает multipart загрузку и привязывает файл к матчу
   */
  async completeAndLink(token, csrepMatchId, fileId, logger = null) {
    // 1. Complete multipart
    const compRes = await this.fetchSafe('https://csrep.gg/api/uploads/_complete', {
      method: 'POST',
      headers: generateCsrepHeaders(),
      body: JSON.stringify({ token }),
    }, logger);

    const compJson = compRes.json || {};
    const finalFileId = compJson.result?.id || fileId;

    // 2. Link demo to match
    await this.fetchSafe(`https://csrep.gg/api/matches/${csrepMatchId}`, {
      method: 'POST',
      headers: generateCsrepHeaders(),
      body: JSON.stringify({ demo_url: `file://${finalFileId}` }),
    }, logger);

    return finalFileId;
  }
}
