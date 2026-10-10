import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { readJsonSafe, writeJsonAtomic } from '../../src/storage/atomic-file.js';
import { HistoryStore } from '../../src/storage/history-store.js';
import { CookieStore } from '../../src/storage/cookie-store.js';

const TEST_DIR = path.resolve('./tests_temp_storage');

describe('Storage Layer', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  it('atomic-file: should write and read JSON atomically', () => {
    const file = path.join(TEST_DIR, 'data.json');
    const payload = { test: 123, status: 'ok' };
    const success = writeJsonAtomic(file, payload);
    expect(success).toBe(true);

    const read = readJsonSafe(file);
    expect(read).toEqual(payload);
  });

  it('atomic-file: should return defaultValue on missing file', () => {
    const read = readJsonSafe(path.join(TEST_DIR, 'nonexistent.json'), { def: true });
    expect(read).toEqual({ def: true });
  });

  it('history-store: should track uploaded match IDs and save to disk', () => {
    const histFile = path.join(TEST_DIR, 'history.json');
    const store = new HistoryStore(histFile);

    expect(store.has('match_1')).toBe(false);
    store.add('match_1');
    expect(store.has('match_1')).toBe(true);
    expect(store.size()).toBe(1);

    // Reload from disk
    const store2 = new HistoryStore(histFile);
    expect(store2.has('match_1')).toBe(true);
  });

  it('cookie-store: normalizeForPlaywright should add domains and handle __Host- cookies', () => {
    const store = new CookieStore(path.join(TEST_DIR, 'cookies.json'));
    const raw = [
      { name: 'cf_clearance', value: 'xyz', domain: '.csrep.gg' },
      { name: '__Host-auth', value: 'sec' },
      { name: 'faceit_c', value: '123', domain: '.faceit.com' },
    ];
    const normalized = store.normalizeForPlaywright(raw);
    expect(normalized.length).toBe(3);
    expect(normalized[0].domain).toBe('.csrep.gg');
    expect(normalized[1].url).toBe('https://csrep.gg');
    expect(normalized[2].domain).toBe('.faceit.com');
  });

  it('cookie-store: isExpired should detect expired csrep-access-token', () => {
    const store = new CookieStore();
    expect(store.isExpired([])).toBe(true);

    // Expired token (exp in past)
    const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 })).toString('base64');
    const expiredToken = `eyJhbGciOiJIUzI1NiJ9.${expiredPayload}.sig`;
    expect(store.isExpired([{ name: 'csrep-access-token', value: expiredToken }])).toBe(true);

    // Valid token (exp in future)
    const validPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
    const validToken = `eyJhbGciOiJIUzI1NiJ9.${validPayload}.sig`;
    expect(store.isExpired([{ name: 'csrep-access-token', value: validToken }])).toBe(false);
  });
});
