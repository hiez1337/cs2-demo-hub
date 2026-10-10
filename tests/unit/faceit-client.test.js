import { describe, it, expect, vi } from 'vitest';
import { FaceitApiClient } from '../../src/api/faceit/client.js';

describe('FaceitApiClient', () => {
  it('should extract demo url properly', () => {
    const client = new FaceitApiClient('dummy-key');
    expect(client.extractDemoUrl({ demo_url: ['https://cdn.faceit.com/demo.dem.zst'] }))
      .toBe('https://cdn.faceit.com/demo.dem.zst');
    expect(client.extractDemoUrl({ payload: { demo_urls: ['https://cdn.faceit.com/web2.dem.zst'] } }))
      .toBe('https://cdn.faceit.com/web2.dem.zst');
    expect(client.extractDemoUrl({ payload: { demo_url: 'https://cdn.faceit.com/web2-single.dem.zst' } }))
      .toBe('https://cdn.faceit.com/web2-single.dem.zst');
    expect(client.extractDemoUrl({})).toBeNull();
    expect(client.extractDemoUrl(null)).toBeNull();
  });

  it('should query match details with Authorization header', async () => {
    const client = new FaceitApiClient('test-token-123');
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ match_id: '1-abc', demo_url: ['https://demo.url'] }),
    }));
    const res = await client.getMatchDetails('1-abc');
    expect(res.match_id).toBe('1-abc');
  });
  it('should fallback to Web API v2 when apiKey is missing', async () => {
    const client = new FaceitApiClient(null);
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('/api/match/v2/matches/web-123')) {
        return {
          ok: true,
          json: async () => ({ payload: { id: 'web-123', demo_urls: ['https://web.demo.url'] } }),
        };
      }
      return { ok: false };
    });
    const res = await client.getMatchDetails('web-123');
    expect(res).not.toBeNull();
    expect(res.payload.id).toBe('web-123');
    expect(client.extractDemoUrl(res)).toBe('https://web.demo.url');
  });

  it('should fallback to Web API v2 when Open API v4 returns 401', async () => {
    const client = new FaceitApiClient('invalid-api-key');
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('/data/v4/matches/')) {
        return { status: 401, ok: false };
      }
      if (url.includes('/api/match/v2/matches/m-fallback')) {
        return {
          ok: true,
          json: async () => ({ payload: { id: 'm-fallback', demo_urls: ['https://fallback.url'] } }),
        };
      }
      return { ok: false };
    });
    const res = await client.getMatchDetails('m-fallback');
    expect(res).not.toBeNull();
    expect(res.payload.id).toBe('m-fallback');
  });
});
