import { describe, it, expect, vi } from 'vitest';
import { FaceitApiClient } from '../../src/api/faceit/client.js';

describe('FaceitApiClient', () => {
  it('should extract demo url properly', () => {
    const client = new FaceitApiClient('dummy-key');
    expect(client.extractDemoUrl({ demo_url: ['https://cdn.faceit.com/demo.dem.zst'] }))
      .toBe('https://cdn.faceit.com/demo.dem.zst');
    expect(client.extractDemoUrl({})).toBeNull();
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
});
