import { generateCsrepHeaders, buildCsrepAuthHeaders } from '../../domain/csrep-crypto.js';

export function normalizeCsrepMatch(m, steamId) {
  if (!m) return null;
  const player = (m.players || []).find((p) => String(p.id) === String(steamId));
  const team = player ? player.team : null;
  const isWin =
    typeof m.winner !== 'undefined' && team !== null
      ? m.winner === team
      : Array.isArray(m.score)
      ? m.score[0] > m.score[1]
      : Boolean(m.is_win || m.isWin);

  let scoreStr = '—';
  if (Array.isArray(m.score) && m.score.length === 2) {
    if (team !== null) {
      const myScore = m.score[team];
      const oppScore = m.score[team === 0 ? 1 : 0];
      scoreStr = `${myScore}:${oppScore}`;
    } else {
      scoreStr = `${m.score[0]}:${m.score[1]}`;
    }
  } else if (typeof m.score === 'string') {
    scoreStr = m.score;
  }

  const rawStatus = m.status || 'missing';
  const status =
    rawStatus === 'DEMO_MISSING' ? 'missing' : rawStatus === 'SUCCESS' ? 'uploaded' : rawStatus;

  const matchId = m.id || m.csrepMatchId;
  const faceitId = m.source_id || m.faceitMatchId || m.faceit_id || null;

  return {
    id: matchId,
    csrepMatchId: matchId,
    faceit_id: faceitId,
    faceitMatchId: faceitId,
    map: m.map,
    score: scoreStr,
    is_win: isWin ? 1 : 0,
    status,
    demo_size: m.demo_size || 140,
    rank: player?.rank || m.rank || null,
    date: m.date,
    source: m.source || m.type || 'FACEIT',
  };
}

export class CsrepClient {
  constructor(options = {}) {
    this.evaluateFn = options.evaluateFn || null;
  }

  async getMissingMatches(pageCsrep, steamId, maxPages = 3) {
    if (!pageCsrep) return [];
    if (typeof pageCsrep.evaluate !== 'function') {
      const sId = typeof pageCsrep === 'string' ? pageCsrep : steamId;
      const token = typeof pageCsrep === 'string' ? steamId : null;
      return this.getMissingMatchesDirect(sId, token, maxPages);
    }
    if (!steamId) return [];

    if (typeof pageCsrep.goto === 'function') {
      await pageCsrep.goto(`https://csrep.gg/player/${steamId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      if (typeof pageCsrep.waitForTimeout === 'function') {
        await pageCsrep.waitForTimeout(2000);
      }
    }

    if (typeof pageCsrep.title === 'function') {
      let title = await pageCsrep.title().catch(() => '');
      if (title && (title.includes('Just a moment') || title.includes('Cloudflare'))) {
        if (typeof pageCsrep.waitForTimeout === 'function') {
          await pageCsrep.waitForTimeout(4000);
        }
        title = await pageCsrep.title().catch(() => '');
        if (title && (title.includes('Just a moment') || title.includes('Cloudflare'))) {
          throw new Error('Сработала защита Cloudflare на csrep.gg ("Just a moment..."). Пожалуйста, выполните вход через пункт меню [4], чтобы сохранить активную сессию браузера.');
        }
      }
    }

    const res = await pageCsrep.evaluate(async ({ steamId, maxPages }) => {
      const rawMatches = [];
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

        const url = `https://csrep.gg/api/player/${steamId}/matches?page=${page}&limit=20`;
        try {
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': secret,
            },
            credentials: 'include',
          });
          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            break;
          }
          const json = await res.json();
          const list = json.result || [];
          for (const m of list) {
            rawMatches.push(m);
          }
          hasNextPage = json.pagination?.hasNextPage ?? false;
        } catch (e) {
          lastError = e.message;
          break;
        }
        page++;
      }
      return { rawMatches, lastError, scannedPages: page - 1 };
    }, { steamId, maxPages });

    if (Array.isArray(res)) {
      return res.map(m => normalizeCsrepMatch(m, steamId)).filter(Boolean);
    }

    const raw = res?.rawMatches || res?.missingMatches || [];
    const normalized = raw.map(m => normalizeCsrepMatch(m, steamId)).filter(Boolean);

    if (res && res.lastError && normalized.length === 0 && res.scannedPages === 0) {
      throw new Error(`Ошибка ответа API csrep.gg (${res.lastError}). Возможно, требуется обновить сессию через пункт [4].`);
    }

    return normalized.filter(m => m.status === 'missing' || m.status === 'DEMO_MISSING');
  }

  async getAllMatches(pageCsrep, steamId, maxPages = 1) {
    if (!pageCsrep || typeof pageCsrep.evaluate !== 'function') {
      return this.getAllMatchesDirect(steamId, null, maxPages);
    }
    const res = await pageCsrep.evaluate(async ({ steamId, maxPages }) => {
      const rawMatches = [];
      let page = 1;
      let hasNextPage = true;
      while (hasNextPage && page <= maxPages) {
        const reqId = crypto.randomUUID();
        const timestamp = Date.now().toString();
        let hash = 0;
        const str = `${reqId}${timestamp}`;
        for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
        const secret = (hash >>> 0).toString(36);
        const res = await fetch(`https://csrep.gg/api/player/${steamId}/matches?page=${page}&limit=20`, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'X-Request-ID': reqId,
            'X-Request-Timestamp': timestamp,
            'X-Request-Secret': secret,
          },
          credentials: 'include',
        });
        if (!res.ok) break;
        const data = await res.json();
        for (const m of (data.result || [])) rawMatches.push(m);
        hasNextPage = data.pagination?.hasNextPage ?? false;
        page++;
      }
      return rawMatches;
    }, { steamId, maxPages });

    const raw = Array.isArray(res) ? res : (res?.rawMatches || []);
    return raw.map(m => normalizeCsrepMatch(m, steamId)).filter(Boolean);
  }

  async getAllMatchesDirect(steamId, sessionToken = null, maxPages = 1) {
    if (!steamId) return [];

    if (typeof this.evaluateFn === 'function') {
      const raw = await this.evaluateFn(async ({ steamId, maxPages }) => {
        const rawMatches = [];
        let page = 1;
        let hasNextPage = true;
        while (hasNextPage && page <= maxPages) {
          const reqId = crypto.randomUUID();
          const timestamp = Date.now().toString();
          let hash = 0;
          const str = `${reqId}${timestamp}`;
          for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
          const secret = (hash >>> 0).toString(36);

          const res = await fetch(`https://csrep.gg/api/player/${steamId}/matches?page=${page}&limit=20`, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': secret,
            },
            credentials: 'include',
          });
          if (!res.ok) break;
          const data = await res.json();
          for (const m of (data.result || [])) rawMatches.push(m);
          hasNextPage = data.pagination?.hasNextPage ?? false;
          page++;
        }
        return rawMatches;
      }, { steamId, maxPages });
      if (Array.isArray(raw)) {
        return raw.map(m => normalizeCsrepMatch(m, steamId)).filter(Boolean);
      }
    }

    // Direct fetch fallback
    const rawMatches = [];
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage && page <= maxPages) {
      const headers = buildCsrepAuthHeaders(sessionToken);
      const url = `https://csrep.gg/api/player/${steamId}/matches?page=${page}&limit=20`;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) break;
        const json = await res.json();
        for (const m of (json.result || [])) rawMatches.push(m);
        hasNextPage = json.pagination?.hasNextPage ?? false;
      } catch {
        break;
      }
      page++;
    }
    return rawMatches.map(m => normalizeCsrepMatch(m, steamId)).filter(Boolean);
  }

  async getMissingMatchesDirect(steamId, sessionToken = null, maxPages = 3) {
    if (!steamId) return [];
    const all = await this.getAllMatchesDirect(steamId, sessionToken, maxPages);
    return all.filter(m => m.status === 'missing' || m.status === 'DEMO_MISSING');
  }

}
