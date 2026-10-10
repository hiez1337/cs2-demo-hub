import { generateCsrepHeaders } from '../../domain/csrep-crypto.js';

export class CsrepClient {
  async getMissingMatches(pageCsrep, steamId, maxPages = 3) {
    if (!steamId || !pageCsrep) return [];

    await pageCsrep.goto(`https://csrep.gg/player/${steamId}`, { waitUntil: 'domcontentloaded' });
    await pageCsrep.waitForTimeout(2000);

    if (typeof pageCsrep.title === 'function') {
      let title = await pageCsrep.title();
      if (title && (title.includes('Just a moment') || title.includes('Cloudflare'))) {
        await pageCsrep.waitForTimeout(4000);
        title = await pageCsrep.title();
        if (title && (title.includes('Just a moment') || title.includes('Cloudflare'))) {
          throw new Error('Сработала защита Cloudflare на csrep.gg ("Just a moment..."). Пожалуйста, выполните вход через пункт меню [4], чтобы сохранить активную сессию браузера.');
        }
      }
    }

    const res = await pageCsrep.evaluate(async ({ steamId, maxPages }) => {
      const missingMatches = [];
      let page = 1;
      let hasNextPage = true;
      let lastError = null;

      while (hasNextPage && page <= maxPages) {
        const reqId = crypto.randomUUID();
        const timestamp = Date.now().toString();
        let hash = 0;
        const str = `${reqId}${timestamp}`;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
        }
        const secret = (hash >>> 0).toString(36);

        const url = `https://csrep.gg/api/player/${steamId}/matches?page=${page}&limit=20&source=FACEIT`;
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': secret,
            },
          });
          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            break;
          }
          const json = await res.json();
          const list = json.result || [];
          for (const m of list) {
            if (m.source === 'FACEIT' && m.status === 'DEMO_MISSING') {
              missingMatches.push({
                csrepMatchId: m.id,
                faceitMatchId: m.source_id,
                map: m.map,
                date: m.date,
                score: m.score,
              });
            }
          }
          hasNextPage = json.pagination?.hasNextPage ?? false;
        } catch (e) {
          lastError = e.message;
          break;
        }
        page++;
      }
      return { missingMatches, lastError, scannedPages: page - 1 };
    }, { steamId, maxPages });

    if (Array.isArray(res)) return res; // Для обратной совместимости с мок-тестами
    if (res && res.lastError && res.missingMatches?.length === 0 && res.scannedPages === 0) {
      throw new Error(`Ошибка ответа API csrep.gg (${res.lastError}). Возможно, требуется обновить сессию через пункт [4].`);
    }

    return (res && res.missingMatches) || [];
  }
}
