export class FaceitApiClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey || null;
    this.baseUrl = 'https://open.faceit.com/data/v4';
    this.customFetch = typeof options === 'function' ? options : (options?.fetch || null);
  }

  async getMatchDetails(faceitMatchId) {
    const fetchFn = this.customFetch || globalThis.fetch;

    // 1. Try Open API v4 if apiKey is present
    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const res = await fetchFn(`${this.baseUrl}/matches/${faceitMatchId}`, {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
          },
        });
        clearTimeout(timer);
        if (res.status === 401) {
          console.error('[FaceitAPI] 401 Unauthorized: проверьте FACEIT_API_KEY');
        } else if (res.ok) {
          return await res.json();
        }
      } catch {}
    }

    // 2. Web API v2 fallback (used by web client, does not require official Open API key)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetchFn(`https://www.faceit.com/api/match/v2/matches/${faceitMatchId}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    return null;
  }

  extractDemoUrl(matchDetails) {
    if (!matchDetails) return null;

    const candidates = [
      matchDetails?.payload?.demo_urls,
      matchDetails?.payload?.demo_url,
      matchDetails?.demo_urls,
      matchDetails?.demo_url,
    ];

    for (const item of candidates) {
      if (!item) continue;
      const rawUrl = Array.isArray(item) ? item[0] : item;
      if (typeof rawUrl === 'string' && rawUrl.startsWith('http')) {
        return rawUrl;
      }
    }

    return null;
  }
}
