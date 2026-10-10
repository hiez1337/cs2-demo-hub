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
});
