import { describe, it, expect, vi } from 'vitest';
import { FaceitDownloader } from '../../src/api/faceit/downloader.js';

describe('FaceitDownloader', () => {
  it('should download demo via signed CDN url', async () => {
    const mockApiClient = {
      getMatchDetails: vi.fn(async () => ({ demo_url: ['https://raw.faceit.cdn/demo'] })),
      extractDemoUrl: vi.fn(() => 'https://raw.faceit.cdn/demo'),
    };
    const downloader = new FaceitDownloader(mockApiClient, './tests_temp_down');
    const mockPage = { evaluate: vi.fn(async (fn, arg) => fn(arg)) };

    const dummyBytes = new TextEncoder().encode('demo-binary-data');
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('download-url')) {
        return { ok: true, json: async () => ({ payload: { download_url: 'https://signed.faceit.cdn/demo' } }) };
      }
      return {
        ok: true,
        arrayBuffer: async () => dummyBytes.buffer.slice(dummyBytes.byteOffset, dummyBytes.byteOffset + dummyBytes.byteLength),
      };
    });

    const buffer = await downloader.downloadDemo({ faceitMatchId: 'm-123' }, mockPage);
    expect(buffer).not.toBeNull();
    expect(buffer.toString('utf8')).toBe('demo-binary-data');
  });

  it('should download in parallel using HTTP Range 206', async () => {
    const downloader = new FaceitDownloader({}, './tests_temp_down', 4);
    const content = '0123456789abcdefghijklmnopqrstuvwxyz';
    const totalBytes = Buffer.from(content);

    globalThis.fetch = vi.fn(async (url, opts) => {
      const range = opts?.headers?.Range;
      if (range === 'bytes=0-0') {
        return {
          status: 206,
          headers: new Headers({ 'content-range': `bytes 0-0/${totalBytes.length}` }),
        };
      }
      if (range && range.startsWith('bytes=')) {
        const [start, end] = range.replace('bytes=', '').split('-').map(Number);
        const slice = totalBytes.subarray(start, end + 1);
        return {
          status: 206,
          arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
        };
      }
      return { status: 200, ok: true, arrayBuffer: async () => totalBytes.buffer };
    });

    let reportedProgress = [];
    const buf = await downloader.downloadParallel('https://mock.cdn/demo.dem', (p) => reportedProgress.push(p));
    expect(buf).not.toBeNull();
    expect(buf.toString()).toBe(content);
    expect(reportedProgress.length).toBeGreaterThan(0);
  });

  it('should download demo directly without pageFaceit (downloadDemoDirect)', async () => {
    const mockApiClient = {
      getMatchDetails: vi.fn(async () => ({ demo_url: ['https://raw.faceit.cdn/demo-direct'] })),
      extractDemoUrl: vi.fn(() => 'https://raw.faceit.cdn/demo-direct'),
    };
    const downloader = new FaceitDownloader(mockApiClient, './tests_temp_down');
    const dummyBytes = new TextEncoder().encode('direct-demo-bytes');

    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('download-url')) {
        return { ok: true, json: async () => ({ payload: { download_url: 'https://signed.faceit.cdn/demo-direct' } }) };
      }
      return {
        ok: true,
        arrayBuffer: async () => dummyBytes.buffer.slice(dummyBytes.byteOffset, dummyBytes.byteOffset + dummyBytes.byteLength),
      };
    });

    const buffer = await downloader.downloadDemoDirect({ faceitMatchId: 'm-direct-123' });
    expect(buffer).not.toBeNull();
    expect(buffer.toString('utf8')).toBe('direct-demo-bytes');
  });
  it('should sign demo url using custom signUrlFn', async () => {
    const mockApiClient = {
      getMatchDetails: vi.fn(async () => ({ demo_url: ['https://raw.faceit.cdn/custom-sign'] })),
      extractDemoUrl: vi.fn(() => 'https://raw.faceit.cdn/custom-sign'),
    };
    const mockSigner = vi.fn(async (rawUrl, token) => `https://signed.by.signer/${token}`);
    const downloader = new FaceitDownloader(mockApiClient, './tests_temp_down', 4, {
      signUrlFn: mockSigner,
    });
    const dummyBytes = new TextEncoder().encode('signer-bytes');

    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('signed.by.signer')) {
        return {
          ok: true,
          arrayBuffer: async () => dummyBytes.buffer.slice(dummyBytes.byteOffset, dummyBytes.byteOffset + dummyBytes.byteLength),
        };
      }
      return { ok: false };
    });

    const buffer = await downloader.downloadDemoDirect({ faceitMatchId: 'm-sign-1' }, null, null, 'token-abc');
    expect(mockSigner).toHaveBeenCalledWith('https://raw.faceit.cdn/custom-sign', 'token-abc');
    expect(buffer).not.toBeNull();
    expect(buffer.toString('utf8')).toBe('signer-bytes');
  });

  it('should pass Authorization header with faceitToken in direct signing fetch', async () => {
    const mockApiClient = {
      getMatchDetails: vi.fn(async () => ({ demo_url: ['https://raw.faceit.cdn/bearer-demo'] })),
      extractDemoUrl: vi.fn(() => 'https://raw.faceit.cdn/bearer-demo'),
    };
    const downloader = new FaceitDownloader(mockApiClient, './tests_temp_down');
    let sentHeaders = null;
    const dummyBytes = new TextEncoder().encode('bearer-bytes');

    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.includes('download-url')) {
        sentHeaders = opts.headers;
        return { ok: true, json: async () => ({ payload: { download_url: 'https://signed.faceit.cdn/bearer-demo' } }) };
      }
      return {
        ok: true,
        arrayBuffer: async () => dummyBytes.buffer.slice(dummyBytes.byteOffset, dummyBytes.byteOffset + dummyBytes.byteLength),
      };
    });

    const buffer = await downloader.downloadDemoDirect({ faceitMatchId: 'm-bearer-1' }, null, null, 'jwt-bearer-xyz');
    expect(sentHeaders).not.toBeNull();
    expect(sentHeaders['Authorization']).toBe('Bearer jwt-bearer-xyz');
    expect(buffer).not.toBeNull();
    expect(buffer.toString('utf8')).toBe('bearer-bytes');
  });
});
