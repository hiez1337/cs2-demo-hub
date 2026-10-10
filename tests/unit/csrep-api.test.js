import { describe, it, expect, vi } from 'vitest';
import { CsrepClient } from '../../src/api/csrep/client.js';
import { CsrepUploader } from '../../src/api/csrep/uploader.js';

describe('CsrepClient & CsrepUploader', () => {
  it('should scan for DEMO_MISSING matches via pageCsrep.evaluate', async () => {
    const client = new CsrepClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: [{ id: 'm1', source: 'FACEIT', source_id: 'f1', status: 'DEMO_MISSING', map: 'de_mirage', date: '2026-08-20', score: '13:9' }],
        pagination: { hasNextPage: false },
      }),
    }));

    const mockPage = {
      goto: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async (fn, args) => fn(args)),
    };

    const matches = await client.getMissingMatches(mockPage, '76561198434644264', 2);
    expect(matches.length).toBe(1);
    expect(matches[0].csrepMatchId).toBe('m1');
  });

  it('should initialize multipart upload and complete', async () => {
    const uploader = new CsrepUploader();
    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('_presign')) return { ok: true, json: async () => ({ result: 'https://r2.storage/part-1' }) };
      if (url.includes('_complete')) return { ok: true, json: async () => ({ result: { id: 'final_file_id' } }) };
      return { ok: true, json: async () => ({ result: { token: 'tok_abc', file: { id: 'file_123' } } }) };
    });

    const mockPage = { evaluate: vi.fn(async (fn, args) => fn(args)) };
    const { token } = await uploader.initMultipartUpload(mockPage, 'demo.dem.zst', 1000);
    expect(token).toBe('tok_abc');

    const presign = await uploader.getPresignedUrl(mockPage, 'tok_abc', 1);
    expect(presign).toBe('https://r2.storage/part-1');

    const complete = await uploader.completeUploadAndLink(mockPage, 'tok_abc', 'm1', 'file_123');
    expect(complete).toBe('final_file_id');
  });

  it('should scan for DEMO_MISSING matches via direct HTTP (getMissingMatchesDirect)', async () => {
    const client = new CsrepClient();
    let requestedHeaders = null;
    globalThis.fetch = vi.fn(async (url, options) => {
      requestedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          result: [{ id: 'm_direct', source: 'FACEIT', source_id: 'f_direct', status: 'DEMO_MISSING', map: 'de_inferno', date: '2026-08-22', score: '13:5' }],
          pagination: { hasNextPage: false },
        }),
      };
    });

    const matches = await client.getMissingMatchesDirect('76561198434644264', 'session_tok_xyz', 2);
    expect(matches.length).toBe(1);
    expect(matches[0].csrepMatchId).toBe('m_direct');
    expect(requestedHeaders['csrep-access-token']).toBe('session_tok_xyz');
    expect(requestedHeaders['X-Request-Secret']).toBeDefined();
  });

  it('should initialize multipart upload, get presigned url, and complete via direct HTTP', async () => {
    const uploader = new CsrepUploader();
    globalThis.fetch = vi.fn(async (url, options) => {
      if (url.includes('_presign')) {
        expect(options.headers['csrep-access-token']).toBe('my_session_token');
        return { ok: true, json: async () => ({ result: 'https://r2.storage/part-1-direct' }) };
      }
      if (url.includes('_complete')) {
        expect(options.headers['csrep-access-token']).toBe('my_session_token');
        return { ok: true, json: async () => ({ result: { id: 'final_direct_id' } }) };
      }
      if (url.includes('matches/')) {
        expect(options.headers['csrep-access-token']).toBe('my_session_token');
        return { ok: true, json: async () => ({}) };
      }
      expect(options.headers['csrep-access-token']).toBe('my_session_token');
      return { ok: true, json: async () => ({ result: { token: 'tok_direct', file: { id: 'file_direct' } } }) };
    });

    const { token } = await uploader.initMultipartDirect('my_session_token', 'demo.dem.zst', 5000);
    expect(token).toBe('tok_direct');

    const presign = await uploader.getPresignedUrlDirect('tok_direct', 1, 'my_session_token');
    expect(presign).toBe('https://r2.storage/part-1-direct');

    const complete = await uploader.completeUploadAndLinkDirect('tok_direct', 'm_direct', 'file_direct', 'my_session_token');
    expect(complete).toBe('final_direct_id');
  });

  it('should get all matches via getAllMatches and getAllMatchesDirect', async () => {
    const client = new CsrepClient();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        result: [{ id: 'm_all', source: 'FACEIT', source_id: 'f_all', status: 'AVAILABLE', map: 'de_nuke', date: '2026-08-25', score: '13:11' }],
        pagination: { hasNextPage: false },
      }),
    }));

    const matchesDirect = await client.getAllMatchesDirect('76561198434644264', 'tok_all', 1);
    expect(matchesDirect.length).toBe(1);
    expect(matchesDirect[0].csrepMatchId).toBe('m_all');

    const mockPage = {
      goto: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async (fn, args) => fn(args)),
    };
    const matchesPage = await client.getAllMatches(mockPage, '76561198434644264', 1);
    expect(matchesPage.length).toBe(1);
    expect(matchesPage[0].csrepMatchId).toBe('m_all');

    expect(await client.getAllMatchesDirect(null)).toEqual([]);
  });

  it('should gracefully handle 403 HTML Cloudflare response without JSON syntax error', async () => {
    const uploader = new CsrepUploader();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      headers: { get: () => 'text/html; charset=UTF-8' },
      text: async () => '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
      json: async () => { throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"); },
    }));

    await expect(uploader.initMultipartDirect('demo.dem.zst', 5000)).rejects.toThrow(
      'Требуется авторизация в CSREP (войдите через Steam)'
    );
  });

  it('should delegate direct calls to evaluateFn when available', async () => {
    const evaluateFn = vi.fn(async (fn, args) => {
      if (typeof args?.filename === 'string') {
        return { token: 'eval_tok', fileId: 'eval_fid' };
      }
      if (typeof args?.partNumber === 'number') {
        return 'https://r2.storage/eval-part';
      }
      if (typeof args?.csrepMatchId === 'string') {
        return 'eval_fid';
      }
      return null;
    });

    const uploader = new CsrepUploader({ evaluateFn });

    const initRes = await uploader.initMultipartDirect('demo.dem.zst', 1000);
    expect(initRes.token).toBe('eval_tok');
    expect(evaluateFn).toHaveBeenCalledTimes(1);

    const presign = await uploader.getPresignedUrlDirect('eval_tok', 1);
    expect(presign).toBe('https://r2.storage/eval-part');
    expect(evaluateFn).toHaveBeenCalledTimes(2);

    const comp = await uploader.completeUploadAndLinkDirect('eval_tok', 'm_1', 'eval_fid');
    expect(comp).toBe('eval_fid');
    expect(evaluateFn).toHaveBeenCalledTimes(3);
  });
});
