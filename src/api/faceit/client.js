export class FaceitApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://open.faceit.com/data/v4';
  }

  async getMatchDetails(faceitMatchId) {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}/matches/${faceitMatchId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
      });
      if (res.status === 401) {
        console.error('[FaceitAPI] 401 Unauthorized: проверьте FACEIT_API_KEY');
        return null;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  extractDemoUrl(matchDetails) {
    if (!matchDetails || !matchDetails.demo_url) return null;
    const url = Array.isArray(matchDetails.demo_url) ? matchDetails.demo_url[0] : matchDetails.demo_url;
    return url && url.startsWith('http') ? url : null;
  }
}
