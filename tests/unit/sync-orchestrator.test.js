import { describe, it, expect, vi } from 'vitest';
import { SyncOrchestrator } from '../../src/core/sync-orchestrator.js';
import { AppStateStore } from '../../src/core/state-store.js';

describe('SyncOrchestrator', () => {
  it('should scan and filter matches', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockBrowserManager = {
      getContext: vi.fn(async () => ({
        pages: () => [{ goto: vi.fn(async () => {}), evaluate: vi.fn(async () => {}) }],
        newPage: vi.fn(async () => ({ goto: vi.fn(async () => {}), waitForTimeout: vi.fn(async () => {}), close: vi.fn(async () => {}) })),
      })),
      saveCookies: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };

    const mockCsrepClient = {
      getMissingMatches: vi.fn(async () => [
        { csrepMatchId: 'm1', faceitMatchId: 'f1', map: 'de_mirage', date: '2026-08-20', score: '13:9' },
        { csrepMatchId: 'm2', faceitMatchId: 'f2', map: 'de_dust2', date: '2026-08-21', score: '16:14' },
      ]),
    };
    const mockHistoryStore = { has: vi.fn((id) => id === 'm1'), add: vi.fn() };

    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264', maxPages: 3, chunkConcurrency: 4 },
      stateStore,
      browserManager: mockBrowserManager,
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: mockCsrepClient,
      csrepUploader: {},
      historyStore: mockHistoryStore,
      chunkWorkerPool: {},
    });

    const unhandled = await orchestrator.scan(3);
    expect(unhandled.length).toBe(1);
    expect(unhandled[0].csrepMatchId).toBe('m2');
  });
});
