// ==UserScript==
// @name         CSREP.GG — FACEIT Demo Auto-Uploader
// @namespace    https://csrep.gg/
// @version      1.0.0
// @description  Автоматически загружает FACEIT демки на csrep.gg для анализа
// @author       Auto-generated
// @match        https://csrep.gg/player/*
// @match        https://www.faceit.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      open.faceit.com
// @connect      www.faceit.com
// @connect      api.faceit.com
// @connect      *.faceit-cdn.net
// @connect      *.backblazeb2.com
// @connect      demos-europe-west2.faceit-cdn.net
// @connect      demos-us-east1.faceit-cdn.net
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @connect      cdnjs.cloudflare.com
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════

  const DEFAULT_CONFIG = {
    steamId: '76561198434644264',
    faceitApiKey: '97898eb5-657f-4d91-9c29-eaa74954bf58',
    maxPages: 3,
    autoRun: false,
  };

  function getConfig() {
    return {
      ...DEFAULT_CONFIG,
      steamId: GM_getValue('steamId', DEFAULT_CONFIG.steamId),
      faceitApiKey: GM_getValue('faceitApiKey', DEFAULT_CONFIG.faceitApiKey),
      maxPages: GM_getValue('maxPages', 3),
      autoRun: GM_getValue('autoRun', false),
    };
  }

  // Извлечь Steam ID из URL или конфига
  function getSteamId() {
    const match = window.location.pathname.match(/\/player\/(\d+)/);
    if (match) {
      GM_setValue('steamId', match[1]);
      return match[1];
    }
    return getConfig().steamId;
  }

  // ═══════════════════════════════════════════════
  // UI — ПАНЕЛЬ УПРАВЛЕНИЯ
  // ═══════════════════════════════════════════════

  function createUI() {
    const panel = document.createElement('div');
    panel.id = 'faceit-uploader-panel';
    panel.innerHTML = `
      <style>
        #faceit-uploader-panel {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 380px;
          max-height: 80vh;
          background: #1a1d23;
          border: 1px solid #2a2d35;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #e0e0e0;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        #faceit-uploader-panel.minimized {
          width: auto;
          max-height: none;
        }
        #faceit-uploader-panel.minimized .fup-body { display: none; }
        .fup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #22252d;
          border-bottom: 1px solid #2a2d35;
          cursor: pointer;
          user-select: none;
        }
        .fup-header h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #ff5722;
          letter-spacing: 0.3px;
        }
        .fup-header .fup-minimize {
          background: none;
          border: none;
          color: #888;
          cursor: pointer;
          font-size: 18px;
          padding: 0 4px;
          line-height: 1;
        }
        .fup-body {
          padding: 12px 16px;
          overflow-y: auto;
          max-height: 60vh;
        }
        .fup-section {
          margin-bottom: 12px;
        }
        .fup-section label {
          display: block;
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .fup-input {
          width: 100%;
          padding: 8px 10px;
          background: #13151a;
          border: 1px solid #2a2d35;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 13px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        }
        .fup-input:focus { border-color: #ff5722; }
        .fup-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }
        .fup-btn-primary {
          background: #ff5722;
          color: white;
        }
        .fup-btn-primary:hover { background: #e64a19; }
        .fup-btn-primary:disabled {
          background: #333;
          color: #666;
          cursor: not-allowed;
        }
        .fup-log {
          background: #13151a;
          border: 1px solid #2a2d35;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 11px;
          font-family: 'Consolas', 'Monaco', monospace;
          max-height: 200px;
          overflow-y: auto;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .fup-log .info { color: #90caf9; }
        .fup-log .success { color: #a5d6a7; }
        .fup-log .warn { color: #ffcc80; }
        .fup-log .error { color: #ef9a9a; }
        .fup-log .step { color: #ce93d8; font-weight: 600; }
        .fup-progress {
          width: 100%;
          height: 6px;
          background: #2a2d35;
          border-radius: 3px;
          margin: 8px 0;
          overflow: hidden;
        }
        .fup-progress-bar {
          height: 100%;
          background: #ff5722;
          border-radius: 3px;
          transition: width 0.3s ease;
          width: 0%;
        }
        .fup-stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          margin-top: 8px;
        }
        .fup-stat {
          display: flex;
          align-items: center;
          gap: 4px;
        }
      </style>
      <div class="fup-header" id="fup-header">
        <h3>🎮 FACEIT Demo Uploader</h3>
        <button class="fup-minimize" id="fup-toggle">─</button>
      </div>
      <div class="fup-body">
        <div class="fup-section">
          <label>Steam ID (64)</label>
          <input type="text" class="fup-input" id="fup-steamid"
                 placeholder="76561198434644264"
                 value="${getSteamId() || ''}">
        </div>
        <div class="fup-section">
          <label>FACEIT API Key</label>
          <input type="password" class="fup-input" id="fup-apikey"
                 placeholder="Вставь API ключ с developers.faceit.com"
                 value="${getConfig().faceitApiKey}">
        </div>
        <div class="fup-section">
          <label>Страниц для проверки (×20 матчей)</label>
          <input type="number" class="fup-input" id="fup-maxpages"
                 min="1" max="50" value="${getConfig().maxPages}">
        </div>
        <div class="fup-section" style="display: flex; gap: 8px;">
          <button class="fup-btn fup-btn-primary" id="fup-start">
            🚀 Начать загрузку
          </button>
          <button class="fup-btn" id="fup-stop" style="background: #374151; color: #f87171; display: none; width: auto; padding: 10px 14px;">
            ⏹️ Стоп
          </button>
        </div>
        <div class="fup-progress" id="fup-progress" style="display:none">
          <div class="fup-progress-bar" id="fup-progress-bar"></div>
        </div>
        <div class="fup-stats" id="fup-stats" style="display:none">
          <span class="fup-stat">✅ <span id="fup-done">0</span></span>
          <span class="fup-stat">⏭️ <span id="fup-skip">0</span></span>
          <span class="fup-stat">❌ <span id="fup-fail">0</span></span>
        </div>
        <div class="fup-section">
          <label>Лог</label>
          <div class="fup-log" id="fup-log">Готов к работе. Нажми кнопку ☝️</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Toggle minimize
    document.getElementById('fup-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('minimized');
      e.target.textContent = panel.classList.contains('minimized') ? '□' : '─';
    });

    // Save config on change
    document.getElementById('fup-steamid').addEventListener('change', (e) => {
      GM_setValue('steamId', e.target.value.trim());
    });
    document.getElementById('fup-apikey').addEventListener('change', (e) => {
      GM_setValue('faceitApiKey', e.target.value.trim());
    });
    document.getElementById('fup-maxpages').addEventListener('change', (e) => {
      GM_setValue('maxPages', parseInt(e.target.value) || 3);
    });

    // Stop button
    document.getElementById('fup-stop').addEventListener('click', () => {
      isCancelled = true;
      logMsg('⏹️ Запрошена остановка...', 'warn');
    });

    // Start button
    document.getElementById('fup-start').addEventListener('click', () => {
      const steamId = document.getElementById('fup-steamid').value.trim();
      const apiKey = document.getElementById('fup-apikey').value.trim();
      if (!steamId) {
        logMsg('Укажи Steam ID (64)!', 'error');
        return;
      }
      if (!apiKey) {
        logMsg('Укажи FACEIT API Key!', 'error');
        return;
      }
      GM_setValue('steamId', steamId);
      GM_setValue('faceitApiKey', apiKey);
      isCancelled = false;
      startUploader();
    });
  }

  // ═══════════════════════════════════════════════
  // LOGGING
  // ═══════════════════════════════════════════════

  function logMsg(msg, type = 'info') {
    const logEl = document.getElementById('fup-log');
    if (!logEl) return;
    const line = document.createElement('div');
    line.className = type;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${time}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setProgress(pct) {
    const bar = document.getElementById('fup-progress-bar');
    const container = document.getElementById('fup-progress');
    if (bar && container) {
      container.style.display = 'block';
      bar.style.width = `${pct}%`;
    }
  }

  function updateStats(done, skip, fail) {
    const statsEl = document.getElementById('fup-stats');
    if (statsEl) statsEl.style.display = 'flex';
    const doneEl = document.getElementById('fup-done');
    const skipEl = document.getElementById('fup-skip');
    const failEl = document.getElementById('fup-fail');
    if (doneEl) doneEl.textContent = done;
    if (skipEl) skipEl.textContent = skip;
    if (failEl) failEl.textContent = fail;
  }
  // ═══════════════════════════════════════════════
  // HTTP — CSREP.GG (с подписью X-Request-Secret)
  // ═══════════════════════════════════════════════

  function generateCsrepHeaders() {
    const reqId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : (
      '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      )
    );
    const timestamp = Date.now().toString();
    const str = `${reqId}${timestamp}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
    }
    const secret = (hash >>> 0).toString(36);

    return {
      'Accept': 'application/json, text/plain, */*',
      'X-Request-ID': reqId,
      'X-Request-Timestamp': timestamp,
      'X-Request-Secret': secret,
    };
  }

  /**
   * Метод 1: Инжекция script-тега в страницу.
   */
  function csrepFetchViaInjection(url, fetchOptions) {
    return new Promise((resolve, reject) => {
      const callbackId = '_csrep_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      function onResult(e) {
        window.removeEventListener(callbackId, onResult);
        resolve(e.detail);
      }
      window.addEventListener(callbackId, onResult);

      const script = document.createElement('script');
      script.textContent = `
        (async function() {
          try {
            const res = await fetch(${JSON.stringify(url)}, ${JSON.stringify(fetchOptions)});
            const text = await res.text();
            let data = text;
            try { data = JSON.parse(text); } catch(e) {}
            window.dispatchEvent(new CustomEvent(${JSON.stringify(callbackId)}, {
              detail: { status: res.status, data: data, ok: res.ok }
            }));
          } catch(err) {
            window.dispatchEvent(new CustomEvent(${JSON.stringify(callbackId)}, {
              detail: { status: 0, data: null, error: err.message }
            }));
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      setTimeout(() => {
        window.removeEventListener(callbackId, onResult);
        reject(new Error('csrepFetch timeout (30s)'));
      }, 30000);
    });
  }

  /**
   * Метод 2: GM_xmlhttpRequest с cookies из document.cookie и заголовками подписи.
   */
  function csrepFetchViaGM(url, options = {}) {
    const signatureHeaders = generateCsrepHeaders();
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          Cookie: document.cookie,
          ...signatureHeaders,
          ...options.headers,
        },
        data: options.body || undefined,
        onload: (res) => {
          let data = res.responseText;
          try { data = JSON.parse(res.responseText); } catch {}
          resolve({ status: res.status, data });
        },
        onerror: (err) => reject(new Error(`GM request failed: ${err.statusText || 'unknown'}`)),
      });
    });
  }

  /**
   * Основная функция csrepFetch с обязательной подписью запросов.
   */
  async function csrepFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `https://csrep.gg${endpoint}`;
    const signatureHeaders = generateCsrepHeaders();

    const fetchOptions = {
      method: options.method || 'GET',
      credentials: 'include',
    };

    const headers = {
      ...signatureHeaders,
      ...options.headers,
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    fetchOptions.headers = headers;

    if (options.body) {
      fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    logMsg(`[HTTP] ${fetchOptions.method} ${endpoint}`, 'info');

    // Метод 1: Injection
    try {
      const result = await csrepFetchViaInjection(url, fetchOptions);
      logMsg(`[HTTP] ← ${result.status} (injection)`, result.status >= 400 ? 'error' : 'info');

      if (result.error) throw new Error(result.error);
      if (result.status === 403) {
        logMsg('[HTTP] 403 от injection — пробую fallback через GM_xmlhttpRequest...', 'warn');
        throw new Error('injection 403');
      }
      return result;
    } catch (injErr) {
      logMsg(`[HTTP] Injection не сработал: ${injErr.message}`, 'warn');
    }

    // Метод 2: GM_xmlhttpRequest fallback
    try {
      const gmOptions = { method: fetchOptions.method };
      if (fetchOptions.body) gmOptions.body = fetchOptions.body;
      const result = await csrepFetchViaGM(url, gmOptions);
      logMsg(`[HTTP] ← ${result.status} (GM fallback)`, result.status >= 400 ? 'error' : 'info');
      return result;
    } catch (gmErr) {
      logMsg(`[HTTP] GM fallback тоже не сработал: ${gmErr.message}`, 'error');
      throw gmErr;
    }
  }

  // ═══════════════════════════════════════════════
  // HTTP — FACEIT API (через GM_xmlhttpRequest, кросс-домен)
  // ═══════════════════════════════════════════════

  function faceitFetch(endpoint) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://open.faceit.com${endpoint}`,
        headers: {
          Authorization: `Bearer ${getConfig().faceitApiKey}`,
          Accept: 'application/json',
        },
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (res.status === 401) reject(new Error('Неверный FACEIT API key'));
            else if (res.status !== 200) reject(new Error(`FACEIT API ${res.status}: ${res.responseText.substring(0, 200)}`));
            else resolve(data);
          } catch (e) {
            reject(new Error(`FACEIT parse error: ${res.responseText.substring(0, 100)}`));
          }
        },
        onerror: (err) => reject(new Error(`FACEIT request failed: ${err.statusText || 'network error'}`)),
      });
    });
  }

  /**
   * Скачать бинарный файл через GM_xmlhttpRequest.
   */
  let isCancelled = false;

  /**
   * Скачать бинарный файл: сначала прямой fetch, при ошибке — GM_xmlhttpRequest (blob).
   */
  async function downloadBinary(url) {
    // Метод 1: Потоковый прямой fetch (быстрее и без лимитов Tampermonkey)
    try {
      logMsg(`Подключаюсь к CDN: ${new URL(url).hostname}...`, 'info');
      const res = await fetch(url);
      if (res.ok) {
        const contentLength = +res.headers.get('Content-Length') || 0;
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
          if (isCancelled) throw new Error('Прервано пользователем');
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (contentLength > 0 && received % (5 * 1024 * 1024) < value.length) {
            const pct = Math.round((received / contentLength) * 100);
            logMsg(`Скачано: ${(received / 1024 / 1024).toFixed(1)} / ${(contentLength / 1024 / 1024).toFixed(1)} MB (${pct}%)`, 'info');
          }
        }

        const fullBuffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          fullBuffer.set(chunk, offset);
          offset += chunk.length;
        }
        return fullBuffer;
      }
    } catch (e) {
      if (isCancelled) throw e;
      logMsg(`Прямой fetch не сработал (${e.message}), пробую через GM_xmlhttpRequest...`, 'warn');
    }

    // Метод 2: GM_xmlhttpRequest с Blob
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        responseType: 'blob',
        onprogress: (e) => {
          if (isCancelled) return;
          if (e.total > 0 && e.loaded % (5 * 1024 * 1024) < 1024 * 1024) {
            const pct = Math.round((e.loaded / e.total) * 100);
            logMsg(`Скачано: ${(e.loaded / 1024 / 1024).toFixed(1)} / ${(e.total / 1024 / 1024).toFixed(1)} MB (${pct}%)`, 'info');
          }
        },
        onload: async (res) => {
          if (isCancelled) { reject(new Error('Прервано пользователем')); return; }
          if (res.status !== 200) {
            reject(new Error(`Ошибка скачивания демо: HTTP ${res.status}`));
            return;
          }
          try {
            const blob = res.response;
            const arrayBuf = await blob.arrayBuffer();
            resolve(new Uint8Array(arrayBuf));
          } catch(err) {
            reject(err);
          }
        },
        onerror: (err) => reject(new Error(`Download failed: ${err.statusText || 'network error'}`)),
      });
    });
  }

  // ═══════════════════════════════════════════════
  // CSREP API
  // ═══════════════════════════════════════════════

  async function getMatchesPage(steamId, page) {
    const res = await csrepFetch(
      `/api/players/${steamId}/matches?page=${page}&limit=20&sort%5Bkey%5D=date&sort%5Bdirection%5D=desc`
    );
    if (res.status !== 200 || !res.data || res.data.status !== 'OK') {
      throw new Error(`Ошибка матчей (HTTP ${res.status})`);
    }
    return res.data;
  }

  async function findMissingDemos(steamId) {
    const config = getConfig();
    const missing = [];
    let totalChecked = 0;

    for (let page = 1; page <= config.maxPages; page++) {
      logMsg(`Проверяю страницу ${page}/${config.maxPages}...`, 'info');
      const data = await getMatchesPage(steamId, page);

      if (!data.result || data.result.length === 0) break;

      for (const match of data.result) {
        totalChecked++;
        if (match.status === 'DEMO_MISSING' && match.source === 'FACEIT' && match.source_id) {
          missing.push({
            csrepMatchId: match.id,
            faceitMatchId: match.source_id,
            map: match.map,
            date: match.date,
            score: match.score,
          });
        }
      }

      if (!data.pagination || !data.pagination.hasNextPage) break;
      await sleep(300);
    }

    logMsg(`Проверено ${totalChecked} матчей, найдено ${missing.length} без демо`, 'info');
    return missing;
  }

  // ═══════════════════════════════════════════════
  // FACEIT API
  // ═══════════════════════════════════════════════

  async function getFaceitDemoUrl(faceitMatchId) {
    const data = await faceitFetch(`/data/v4/matches/${faceitMatchId}`);
    if (!data.demo_url || data.demo_url.length === 0) return null;
    const rawUrl = Array.isArray(data.demo_url) ? data.demo_url[0] : data.demo_url;

    // Запрашиваем актуальный подписанный URL скачивания с FACEIT
    try {
      if (window.location.hostname.includes('faceit.com')) {
        const res = await unsafeWindow.fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'faceit-referer': 'web-next',
          },
          body: JSON.stringify({ resource_url: rawUrl }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.payload && json.payload.download_url) {
            logMsg('Получен прямой signed URL демо ✓', 'info');
            return json.payload.download_url;
          }
        }
        logMsg(`download-url native HTTP ${res.status}`, 'warn');
        return rawUrl;
      }

      const signedRes = await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://www.faceit.com/api/download/v2/demos/download-url',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'faceit-referer': 'web-next',
            'Origin': 'https://www.faceit.com',
            'Referer': `https://www.faceit.com/ru/cs2/room/${faceitMatchId}`,
          },
          data: JSON.stringify({ resource_url: rawUrl }),
          onload: (res) => {
            try {
              const json = JSON.parse(res.responseText);
              if (res.status === 200 && json.payload && json.payload.download_url) {
                logMsg('Получен прямой signed URL демо ✓', 'info');
                resolve(json.payload.download_url);
                return;
              }
              logMsg(`download-url HTTP ${res.status}: ${res.responseText.substring(0, 150)}`, 'warn');
            } catch {
              logMsg(`download-url parse err: HTTP ${res.status}`, 'warn');
            }
            resolve(rawUrl);
          },
          onerror: (err) => {
            logMsg(`download-url net err: ${err.statusText || 'unknown'}`, 'warn');
            resolve(rawUrl);
          },
        });
      });
      return signedRes;
    } catch (e) {
      logMsg(`download-url exception: ${e.message}`, 'warn');
      return rawUrl;
    }
  }

  // ═══════════════════════════════════════════════
  // КОНВЕРТАЦИЯ: .dem.gz → .dem.zst
  // ═══════════════════════════════════════════════

  /**
   * Распаковать gzip в браузере через DecompressionStream.
   */
  async function decompressGzip(compressedData) {
    const ds = new unsafeWindow.DecompressionStream('gzip');
    const blob = new Blob([compressedData]);
    const stream = blob.stream().pipeThrough(ds);
    const reader = stream.getReader();
    const chunks = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }

    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  /**
   * Сжать данные в Zstandard.
   * Используем встроенную библиотеку fzstd-lite или простой fallback.
   * На самом деле: csrep.gg принимает и .dem (без сжатия) — пробуем так.
   * Если нет — загружаем ZstdCodec из CDN.
   */
  let _zstdCompress = null;

  async function loadZstdCompressor() {
    if (_zstdCompress) return _zstdCompress;

    logMsg('Загружаю zstd компрессор (WASM)...', 'info');

    // Если ZstdCodec уже определен в каком-то скоупе
    let zCodec = typeof ZstdCodec !== 'undefined' ? ZstdCodec : (typeof unsafeWindow.ZstdCodec !== 'undefined' ? unsafeWindow.ZstdCodec : null);

    if (!zCodec) {
      const cdnUrls = [
        'https://cdn.jsdelivr.net/npm/zstd-codec/dist/bundle.js',
        'https://cdn.jsdelivr.net/npm/fzstd',
        'https://unpkg.com/fzstd@0.1.1/umd/index.js',
      ];

      for (const url of cdnUrls) {
        try {
          const host = new URL(url).hostname;
          logMsg(`Загружаю компрессор (${host})...`, 'info');
          const code = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url: url,
              onload: (res) => {
                if (res.status === 200 && res.responseText.length > 500) {
                  resolve(res.responseText);
                } else {
                  reject(new Error(`HTTP ${res.status}`));
                }
              },
              onerror: (err) => reject(new Error(err.statusText || 'network error')),
            });
          });

          // Выполняем код библиотеки в глобальном контексте
          try {
            const runScript = new Function('window', 'unsafeWindow', 'self', 'globalThis', code);
            runScript(window, unsafeWindow, window, window);
          } catch(err) {
            eval(code);
          }

          // 1. Проверяем zstd-codec
          zCodec = typeof ZstdCodec !== 'undefined' ? ZstdCodec : (typeof unsafeWindow.ZstdCodec !== 'undefined' ? unsafeWindow.ZstdCodec : (typeof window.ZstdCodec !== 'undefined' ? window.ZstdCodec : null));
          if (zCodec) {
            return new Promise((resolve) => {
              zCodec.run((zstd) => {
                const simple = new zstd.Simple();
                _zstdCompress = (data) => simple.compress(data, 3);
                logMsg('zstd компрессор готов (WASM) ✓', 'success');
                resolve(_zstdCompress);
              });
            });
          }

          // 2. Проверяем fzstd
          const fz = typeof fzstd !== 'undefined' ? fzstd : (typeof unsafeWindow.fzstd !== 'undefined' ? unsafeWindow.fzstd : (typeof window.fzstd !== 'undefined' ? window.fzstd : null));
          if (fz && typeof fz.compress === 'function') {
            _zstdCompress = (data) => fz.compress(data, { level: 3 });
            logMsg('zstd компрессор готов (fzstd) ✓', 'success');
            return _zstdCompress;
          }
        } catch (e) {
          logMsg(`Ошибка загрузки: ${e.message}`, 'warn');
        }
      }
    }

    if (!_zstdCompress && !zCodec) {
      throw new Error('Не удалось загрузить zstd библиотеку');
    }

    return _zstdCompress;
  }

  async function compressZstd(data) {
    const compress = await loadZstdCompressor();
    return compress(data);
  }

  async function convertGzToZst(gzData) {
    logMsg('Распаковываю .gz...', 'info');
    const decompressed = await decompressGzip(gzData);
    logMsg(`Размер .dem: ${(decompressed.length / 1024 / 1024).toFixed(1)} MB`, 'info');

    logMsg('Сжимаю в .zst...', 'info');
    const compressed = await compressZstd(decompressed);
    const ratio = ((1 - compressed.length / decompressed.length) * 100).toFixed(1);
    logMsg(`Сжато: ${(decompressed.length / 1024 / 1024).toFixed(1)} → ${(compressed.length / 1024 / 1024).toFixed(1)} MB (${ratio}%)`, 'info');

    return new Uint8Array(compressed);
  }

  // ═══════════════════════════════════════════════
  // UPLOAD TO CSREP.GG — MULTIPART
  // ═══════════════════════════════════════════════

  async function initUpload(filename) {
    const res = await csrepFetch('/api/uploads/demos', {
      method: 'POST',
      body: { filename },
    });
    if (res.status !== 201 || !res.data || res.data.status !== 'OK') {
      throw new Error(`Ошибка инициализации загрузки (HTTP ${res.status})`);
    }
    return {
      token: res.data.result.token,
      fileId: res.data.result.file.id,
    };
  }

  async function getPresignedUrl(token, partNumber) {
    const res = await csrepFetch('/api/uploads/_presign', {
      method: 'POST',
      body: { token, part_number: partNumber },
    });
    if (res.status !== 201 || !res.data || res.data.status !== 'OK') {
      throw new Error(`Presigned URL error part ${partNumber}`);
    }
    return res.data.result;
  }

  function uploadChunk(presignedUrl, chunkData) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'PUT',
        url: presignedUrl,
        data: new Blob([chunkData]),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            resolve(res);
          } else {
            reject(new Error(`Chunk upload failed: HTTP ${res.status}`));
          }
        },
        onerror: (err) => reject(new Error(`Chunk upload network error: ${err.statusText || 'unknown'}`)),
      });
    });
  }

  async function completeUpload(token) {
    const res = await csrepFetch('/api/uploads/_complete', {
      method: 'POST',
      body: { token },
    });
    if (res.status !== 201 || !res.data || res.data.status !== 'OK') {
      throw new Error('Ошибка завершения загрузки');
    }
  }

  async function linkDemoToMatch(csrepMatchId, fileId) {
    const res = await csrepFetch(`/api/matches/${csrepMatchId}`, {
      method: 'POST',
      body: { demo_url: `file://${fileId}` },
    });
    if (res.status !== 201 || !res.data || res.data.status !== 'OK') {
      throw new Error('Ошибка привязки демо к матчу');
    }
    return res.data.result;
  }

  const CHUNK_SIZE = 5 * 1024 * 1024;
  const MAX_CONCURRENT_UPLOADS = 4;

  async function uploadToCsrep(buffer, filename) {
    logMsg('Инициализирую загрузку...', 'info');
    const { token, fileId } = await initUpload(filename);

    const totalParts = Math.ceil(buffer.length / CHUNK_SIZE);
    logMsg(`Загружаю ${totalParts} чанков (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`, 'info');

    // Параллельная загрузка чанков
    let completed = 0;
    const parts = Array.from({ length: totalParts }, (_, i) => i + 1);

    async function uploadPart(partNum) {
      const start = (partNum - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.length);
      const chunk = buffer.slice(start, end);

      const presignedUrl = await getPresignedUrl(token, partNum);
      await uploadChunk(presignedUrl, chunk);

      completed++;
      logMsg(`Чанк ${completed}/${totalParts} загружен`, 'info');
    }

    // Запускаем с ограниченной параллельностью
    await runWithConcurrency(parts, uploadPart, MAX_CONCURRENT_UPLOADS);

    logMsg('Финализирую загрузку...', 'info');
    await completeUpload(token);

    logMsg(`Файл загружен! (ID: ${fileId})`, 'success');
    return fileId;
  }

  // ═══════════════════════════════════════════════
  // УТИЛИТЫ
  // ═══════════════════════════════════════════════

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runWithConcurrency(items, fn, concurrency) {
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const i = idx++;
        await fn(items[i]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ═══════════════════════════════════════════════
  // MAIN — ОРКЕСТРАЦИЯ
  // ═══════════════════════════════════════════════

  async function processMatch(match, index, total) {
    logMsg(`\n━━━ Матч ${index + 1}/${total}: ${match.map} ${match.score.join(':')} (${formatDate(match.date)}) ━━━`, 'step');

    try {
      // 1. Получить URL демо
      logMsg('Запрашиваю URL демо с FACEIT...', 'info');
      const demoUrl = await getFaceitDemoUrl(match.faceitMatchId);

      if (!demoUrl) {
        logMsg('Демо недоступно на FACEIT (истёк срок хранения)', 'warn');
        return 'skipped';
      }

      // 2. Скачать демо
      logMsg('Скачиваю демо с FACEIT CDN...', 'info');
      const downloadedBytes = await downloadBinary(demoUrl);
      logMsg(`Скачано: ${(downloadedBytes.length / 1024 / 1024).toFixed(1)} MB`, 'info');

      // 3. Подготовка данных (если уже .zst, загружаем как есть)
      let zstData;
      if (demoUrl.includes('.zst') || demoUrl.includes('.dem.zst')) {
        logMsg('Файл уже в формате .zst (пропускаем сжатие) ⚡', 'info');
        zstData = downloadedBytes;
      } else {
        logMsg('Конвертирую .dem.gz → .dem.zst...', 'info');
        zstData = await convertGzToZst(downloadedBytes);
      }

      // 4. Загрузить на csrep.gg
      const filename = `${match.faceitMatchId}-1-1.dem.zst`;
      const fileId = await uploadToCsrep(zstData, filename);

      // 5. Привязать к матчу
      logMsg('Привязываю демо к матчу...', 'info');
      const result = await linkDemoToMatch(match.csrepMatchId, fileId);
      logMsg(`✅ Матч обновлён! Статус: ${result.status}`, 'success');

      return 'success';
    } catch (err) {
      logMsg(`Ошибка: ${err.message}`, 'error');
      return 'failed';
    }
  }

  async function startUploader() {
    const btnStart = document.getElementById('fup-start');
    const btnStop = document.getElementById('fup-stop');
    btnStart.disabled = true;
    btnStart.textContent = '⏳ Работаю...';
    btnStop.style.display = 'inline-flex';

    const steamId = getSteamId();
    if (!steamId) {
      logMsg('Не могу определить Steam ID из URL', 'error');
      btnStart.disabled = false;
      btnStart.textContent = '🚀 Начать загрузку';
      btnStop.style.display = 'none';
      return;
    }

    const logEl = document.getElementById('fup-log');
    logEl.innerHTML = '';

    logMsg(`Steam ID: ${steamId}`, 'info');

    try {
      // 1. Найти отсутствующие демки
      logMsg('Проверяю csrep.gg...', 'step');
      const missing = await findMissingDemos(steamId);

      if (isCancelled) {
        logMsg('Остановлено пользователем.', 'warn');
        return;
      }

      if (missing.length === 0) {
        logMsg('Все демки на месте! Нечего загружать. 🎉', 'success');
        return;
      }

      logMsg(`Найдено ${missing.length} матчей без демок:`, 'step');
      for (const m of missing) {
        logMsg(`  ${formatDate(m.date)} | ${m.map} | ${m.score.join(':')}`, 'info');
      }

      // 2. Загрузить zstd компрессор заранее
      await loadZstdCompressor();

      // 3. Обработать каждый матч
      let done = 0, skip = 0, fail = 0;

      for (let i = 0; i < missing.length; i++) {
        if (isCancelled) {
          logMsg('\n⏹️ Процесс остановлен пользователем.', 'warn');
          break;
        }

        setProgress(Math.round(((i) / missing.length) * 100));
        const result = await processMatch(missing[i], i, missing.length);

        if (result === 'success') done++;
        else if (result === 'skipped') skip++;
        else fail++;

        updateStats(done, skip, fail);

        if (i < missing.length - 1 && !isCancelled) await sleep(2000);
      }

      setProgress(100);

      // Итоги
      logMsg(`\n━━━ ИТОГИ ━━━`, 'step');
      logMsg(`Загружено: ${done}`, 'success');
      if (skip > 0) logMsg(`Пропущено: ${skip}`, 'warn');
      if (fail > 0) logMsg(`Ошибок: ${fail}`, 'error');

    } catch (err) {
      logMsg(`Фатальная ошибка: ${err.message}`, 'error');
    } finally {
      btnStart.disabled = false;
      btnStart.textContent = '🚀 Начать загрузку';
      btnStop.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════

  // Подождать загрузку страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }

  // Регистрируем команды в меню Tampermonkey
  GM_registerMenuCommand('⚙️ Настройки', () => {
    const panel = document.getElementById('faceit-uploader-panel');
    if (panel) panel.classList.remove('minimized');
  });

})();
