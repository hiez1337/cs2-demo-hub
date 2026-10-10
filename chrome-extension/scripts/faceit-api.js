/**
 * FACEIT API Client for Chrome Extension (Manifest V3)
 * Retrieves signed Backblaze S3 demo URLs using Tab Execution on faceit.com
 */

export class FaceitApiClient {
  constructor(apiKey = '') {
    this.apiKey = apiKey;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  /**
   * Подписывает сырую ссылку Backblaze через контекст страницы faceit.com (обходит Cloudflare и подписывает S3)
   */
  async signDemoUrlWithFaceitTab(rawUrl, logger = null) {
    if (typeof chrome === 'undefined' || !chrome.tabs) return null;

    let tempTabId = null;
    try {
      // 1. Ищем существующую вкладку faceit.com
      const allTabs = await chrome.tabs.query({});
      let faceitTab = allTabs.find(t => t.url && t.url.includes('faceit.com') && t.status === 'complete')
                   || allTabs.find(t => t.url && t.url.includes('faceit.com'));

      // 2. Если открытой вкладки нет, открываем фоновую тихую вкладку
      if (!faceitTab) {
        if (logger) logger('🌐 Открываю фоновую вкладку FACEIT для авторизации ссылки...');
        faceitTab = await chrome.tabs.create({ url: 'https://www.faceit.com/en', active: false });
        tempTabId = faceitTab.id;

        // Ожидаем завершения загрузки страницы
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 4500);
          const listener = (tabId, info) => {
            if (tabId === faceitTab.id && info.status === 'complete') {
              clearTimeout(timer);
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
        await new Promise(r => setTimeout(r, 1200));
      }

      let signedUrl = null;

      // 3. Способ A: Запрос через Content Script (chrome.tabs.sendMessage)
      try {
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout content script')), 4000);
          chrome.tabs.sendMessage(faceitTab.id, { type: 'SIGN_FACEIT_URL', rawUrl }, (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          });
        });

        if (response && response.ok && response.downloadUrl) {
          signedUrl = response.downloadUrl;
        } else if (response && response.status) {
          if (logger) logger(`⚠️ FACEIT вернул HTTP ${response.status} при подписи ссылки`, 'warn');
        }
      } catch (sendErr) {
        // Если вкладка была открыта ДО установки/обновления расширения, content script может отсутствовать
        if (logger) logger(`ℹ️ Content script в существующей вкладке не ответил, использую прямой executeScript...`);
      }

      // 4. Способ B: Резервное выполнение через chrome.scripting.executeScript
      if (!signedUrl && chrome.scripting && faceitTab?.id) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: faceitTab.id },
            func: async (url) => {
              try {
                const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'faceit-referer': 'web-next',
                  },
                  body: JSON.stringify({ resource_url: url }),
                });
                if (!res.ok) {
                  const txt = await res.text().catch(() => '');
                  return { ok: false, status: res.status, error: txt };
                }
                const json = await res.json();
                return { ok: true, downloadUrl: json.payload?.download_url || null };
              } catch (e) {
                return { ok: false, error: e.message };
              }
            },
            args: [rawUrl],
          });

          if (results && results[0] && results[0].result?.ok) {
            signedUrl = results[0].result.downloadUrl;
          } else if (results && results[0] && results[0].result?.status) {
            if (logger) logger(`⚠️ FACEIT вернул HTTP ${results[0].result.status} при подписи ссылки`, 'warn');
          }
        } catch (execErr) {
          if (logger) logger(`⚠️ Ошибка executeScript: ${execErr.message}`, 'warn');
        }
      }

      // 5. Закрываем временную вкладку если открывали ее сами
      if (tempTabId) {
        chrome.tabs.remove(tempTabId).catch(() => {});
        tempTabId = null;
      }

      if (signedUrl) return signedUrl;
    } catch (e) {
      if (tempTabId) chrome.tabs.remove(tempTabId).catch(() => {});
      if (logger) logger(`⚠️ Ошибка подписи через FACEIT: ${e.message}`, 'warn');
    }

    return null;
  }

  /**
   * Получает прямую подписанную ссылку на скачивание демки
   * @param {string} faceitMatchId
   * @param {Function} [logger]
   * @returns {Promise<string|null>}
   */
  async getDemoDownloadUrl(faceitMatchId, logger = null) {
    if (!faceitMatchId) return null;
    let rawDemoUrl = null;

    const idsToTry = [faceitMatchId];
    if (faceitMatchId.startsWith('1-')) {
      idsToTry.push(faceitMatchId.slice(2));
    } else {
      idsToTry.push(`1-${faceitMatchId}`);
    }

    // 1. Попытка через Open API (если есть ключ)
    if (this.apiKey) {
      for (const id of idsToTry) {
        try {
          const res = await fetch(`https://open.faceit.com/data/v4/matches/${id}`, {
            headers: { 'Authorization': `Bearer ${this.apiKey}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.demo_url) {
              rawDemoUrl = Array.isArray(data.demo_url) ? data.demo_url[0] : data.demo_url;
              if (rawDemoUrl) break;
            }
          }
        } catch (e) {
          if (logger) logger(`⚠️ Open API (${id}): ${e.message}`, 'warn');
        }
      }
    }

    // 2. Если Open API не дал результат, пробуем внутреннее Web API
    if (!rawDemoUrl) {
      for (const id of idsToTry) {
        try {
          const res = await fetch(`https://www.faceit.com/api/match/v2/matches/${id}`, {
            credentials: 'include',
            headers: { 'Accept': 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            const matchPayload = data.payload || data;
            if (matchPayload.demo_url) {
              rawDemoUrl = Array.isArray(matchPayload.demo_url) ? matchPayload.demo_url[0] : matchPayload.demo_url;
              if (rawDemoUrl) break;
            }
          }
        } catch (e) {}
      }
    }

    if (!rawDemoUrl) return null;

    // 3. Подписание ссылки через вкладку FACEIT (100% валидный ответ Backblaze S3)
    const signedUrl = await this.signDemoUrlWithFaceitTab(rawDemoUrl, logger);
    if (signedUrl) return signedUrl;

    // 4. Резервная прямая попытка из Service Worker
    try {
      const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'faceit-referer': 'web-next',
        },
        body: JSON.stringify({ resource_url: rawDemoUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.payload?.download_url || null;
      }
    } catch (e) {}

    return null;
  }
}
