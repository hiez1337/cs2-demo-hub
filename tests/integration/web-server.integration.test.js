import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebServer } from '../../src/server/web-server.js';
import { AppStateStore } from '../../src/core/state-store.js';

describe('WebServer Integration', () => {
  let server;
  let stateStore;
  const testPort = 3999;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  beforeAll(() => {
    stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    server = new WebServer(testPort, '127.0.0.1', stateStore, { scan: async () => [], uploadMatches: async () => {}, stop: () => {} });
    server.start();
  });

  afterAll(() => {
    server.close();
  });

  it('should serve HTML dashboard on GET /', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('CSREP & FACEIT — Demo Uploader Studio');
  });

  it('should respond with snapshot on GET /api/state', async () => {
    const res = await fetch(`${baseUrl}/api/state`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('idle');
  });
});
