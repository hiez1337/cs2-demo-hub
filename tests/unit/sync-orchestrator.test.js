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

  it('should handle empty matchesToUpload', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264' },
      stateStore,
      browserManager: {},
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: {},
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
    });
    await orchestrator.uploadMatches([]);
    expect(stateStore.state.status).toBe('idle');
  });

  it('should run full upload pipeline for matches and support stop', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockPage = {
      goto: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async () => {}),
    };
    const mockBrowserManager = {
      getContext: vi.fn(async () => ({
        pages: () => [mockPage],
        newPage: vi.fn(async () => mockPage),
      })),
      saveCookies: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const mockDownloader = {
      downloadDemo: vi.fn(async (m, p, onProgress) => {
        onProgress({ percent: 50, speedMb: 20 });
        return Buffer.alloc(1024 * 1024 * 2);
      }),
    };
    const mockUploader = {
      initMultipartUpload: vi.fn(async () => ({ token: 'tok_1', fileId: 'f_1' })),
      getPresignedUrl: vi.fn(async () => 'https://r2.storage/part-1'),
      completeUploadAndLink: vi.fn(async () => 'f_1'),
    };
    const mockWorkerPool = {
      upload: vi.fn(async (buf, getUrl, onProgress) => {
        onProgress({ percent: 100, speedMb: 30, completedChunks: 2, totalChunks: 2 });
      }),
    };
    const mockHistoryStore = {
      has: vi.fn(() => false),
      add: vi.fn(),
      save: vi.fn(),
    };

    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264', maxPages: 1 },
      stateStore,
      browserManager: mockBrowserManager,
      faceitApiClient: {},
      faceitDownloader: mockDownloader,
      csrepClient: {},
      csrepUploader: mockUploader,
      historyStore: mockHistoryStore,
      chunkWorkerPool: mockWorkerPool,
    });

    const matches = [
      { csrepMatchId: 'm1', faceitMatchId: 'f1', map: 'de_mirage', score: '13:9' },
    ];

    await orchestrator.uploadMatches(matches);
    expect(mockDownloader.downloadDemo).toHaveBeenCalled();
    expect(mockUploader.initMultipartUpload).toHaveBeenCalled();
    expect(mockWorkerPool.upload).toHaveBeenCalled();
    expect(mockUploader.completeUploadAndLink).toHaveBeenCalled();
    expect(mockHistoryStore.add).toHaveBeenCalledWith('m1');

    orchestrator.stop();
    expect(stateStore.state.status).toBe('stopped');
  });

  it('should handle missing/expired demos gracefully', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockPage = { goto: vi.fn(async () => {}), waitForTimeout: vi.fn(async () => {}) };
    const mockBrowserManager = {
      getContext: vi.fn(async () => ({ pages: () => [mockPage], newPage: vi.fn(async () => mockPage) })),
      saveCookies: vi.fn(async () => {}),
    };
    const mockDownloader = {
      downloadDemo: vi.fn(async () => null),
    };

    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264' },
      stateStore,
      browserManager: mockBrowserManager,
      faceitApiClient: {},
      faceitDownloader: mockDownloader,
      csrepClient: {},
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
    });

    await orchestrator.uploadMatches([{ csrepMatchId: 'm1', faceitMatchId: 'f1', map: 'de_mirage' }]);
    expect(stateStore.state.stats.skipped).toBe(1);
  });

  it('should scan using direct API when browserManager is null', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockCsrepClient = {
      getMissingMatchesDirect: vi.fn(async () => [
        { csrepMatchId: 'direct_m1', faceitMatchId: 'f1', map: 'de_inferno' },
      ]),
    };
    const mockSessionStore = {
      loadTokens: () => ({ csrepToken: 'direct_jwt_token', steamId: '76561198434644264' }),
    };
    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264' },
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: mockCsrepClient,
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
      sessionStore: mockSessionStore,
    });

    const unhandled = await orchestrator.scan(2);
    expect(mockCsrepClient.getMissingMatchesDirect).toHaveBeenCalledWith('76561198434644264', 'direct_jwt_token', 2);
    expect(unhandled.length).toBe(1);
    expect(unhandled[0].csrepMatchId).toBe('direct_m1');
  });

  it('should upload matches using direct API when browserManager is null', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockDownloader = {
      downloadDemoDirect: vi.fn(async () => Buffer.alloc(100, 'a')),
    };
    const mockUploader = {
      initMultipartDirect: vi.fn(async () => ({ token: 'direct_up_token', fileId: 'direct_fid' })),
      getPresignedUrlDirect: vi.fn(async () => 'https://r2.storage/part-1'),
      completeUploadAndLinkDirect: vi.fn(async () => 'direct_fid'),
    };
    const mockWorkerPool = {
      upload: vi.fn(async (_buf, getUrl) => {
        await getUrl(1);
      }),
    };
    const mockHistoryStore = { has: () => false, add: vi.fn() };
    const mockSessionStore = {
      loadTokens: () => ({ csrepToken: 'direct_jwt' }),
    };

    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264' },
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: mockDownloader,
      csrepClient: {},
      csrepUploader: mockUploader,
      historyStore: mockHistoryStore,
      chunkWorkerPool: mockWorkerPool,
      sessionStore: mockSessionStore,
    });

    await orchestrator.uploadMatches([{ csrepMatchId: 'm1', faceitMatchId: 'f1', map: 'de_ancient' }]);
    expect(mockDownloader.downloadDemoDirect).toHaveBeenCalled();
    expect(mockUploader.initMultipartDirect).toHaveBeenCalledWith('f1.dem.zst', 100, 'direct_jwt');
    expect(mockWorkerPool.upload).toHaveBeenCalled();
    expect(mockUploader.completeUploadAndLinkDirect).toHaveBeenCalledWith('direct_up_token', 'm1', 'direct_fid', 'direct_jwt');
    expect(mockHistoryStore.add).toHaveBeenCalledWith('m1');
    expect(stateStore.state.stats.uploaded).toBe(1);
  });

  it('should fall back to tokens.steamId when config.steamId is missing in direct mode', async () => {
    const stateStore = new AppStateStore({}, { has: () => false });
    const mockCsrepClient = {
      getMissingMatchesDirect: vi.fn(async () => [
        { csrepMatchId: 'gui_m1', faceitMatchId: 'f1', map: 'de_nuke' },
      ]),
    };
    const mockSessionStore = {
      loadTokens: () => ({ csrepToken: 'gui_jwt', steamId: '76561198434644264' }),
    };
    const orchestrator = new SyncOrchestrator({
      config: {}, // no steamId in config
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: mockCsrepClient,
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
      sessionStore: mockSessionStore,
    });

    const unhandled = await orchestrator.scan(1);
    expect(mockCsrepClient.getMissingMatchesDirect).toHaveBeenCalledWith('76561198434644264', 'gui_jwt', 1);
    expect(unhandled.length).toBe(1);
    expect(unhandled[0].csrepMatchId).toBe('gui_m1');
  });

  it('should return empty matches and log warning when steamId is completely missing', async () => {
    const stateStore = new AppStateStore({}, { has: () => false });
    const mockCsrepClient = {
      getMissingMatchesDirect: vi.fn(async () => []),
    };
    const mockSessionStore = {
      loadTokens: () => ({ csrepToken: 'gui_jwt', steamId: null }),
    };
    const orchestrator = new SyncOrchestrator({
      config: {},
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: mockCsrepClient,
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
      sessionStore: mockSessionStore,
    });

    const unhandled = await orchestrator.scan(1);
    expect(unhandled).toEqual([]);
    expect(mockCsrepClient.getMissingMatchesDirect).not.toHaveBeenCalled();
    expect(stateStore.state.status).toBe('idle');
  });

  it('should fall back to tokens.steamId when config.steamId is missing in browserManager mode', async () => {
    const stateStore = new AppStateStore({}, { has: () => false });
    const mockCsrepClient = {
      getMissingMatches: vi.fn(async () => [
        { csrepMatchId: 'bm_m1', faceitMatchId: 'f1', map: 'de_anubis' },
      ]),
    };
    const mockBrowserManager = {
      getContext: vi.fn(async () => ({
        pages: () => [{ goto: vi.fn(), evaluate: vi.fn() }],
      })),
    };
    const mockSessionStore = {
      loadTokens: () => ({ csrepToken: 'jwt', steamId: '76561198434644264' }),
    };
    const orchestrator = new SyncOrchestrator({
      config: {},
      stateStore,
      browserManager: mockBrowserManager,
      faceitApiClient: {},
      faceitDownloader: {},
      csrepClient: mockCsrepClient,
      csrepUploader: {},
      historyStore: { has: () => false, add: () => {} },
      chunkWorkerPool: {},
      sessionStore: mockSessionStore,
    });

    const unhandled = await orchestrator.scan(1);
    expect(mockCsrepClient.getMissingMatches).toHaveBeenCalledWith(expect.anything(), '76561198434644264', 1);
    expect(unhandled.length).toBe(1);
  });

  it('should normalize SQLite match object (id and faceit_id) and emit reactive progress with matchId', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const progressEvents = [];
    stateStore.on('progress', (data) => progressEvents.push(data));

    const mockDownloader = {
      downloadDemoDirect: vi.fn(async (m, onProgress) => {
        onProgress({ percent: 50, speedMb: 25.5 });
        return Buffer.alloc(1024 * 1024);
      }),
    };
    const mockUploader = {
      initMultipartDirect: vi.fn(async () => ({ token: 'tok_sql', fileId: 'f_sql' })),
      getPresignedUrlDirect: vi.fn(async () => 'https://r2.storage/part-1'),
      completeUploadAndLinkDirect: vi.fn(async () => 'f_sql'),
    };
    const mockWorkerPool = {
      upload: vi.fn(async (buf, getUrl, onProgress) => {
        onProgress({ percent: 100, speedMb: 31.8, completedChunks: 10, totalChunks: 28 });
      }),
    };
    const mockHistoryStore = {
      has: vi.fn(() => false),
      add: vi.fn(),
      updateStatus: vi.fn(),
    };

    const orchestrator = new SyncOrchestrator({
      config: { steamId: '76561198434644264' },
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: mockDownloader,
      csrepClient: {},
      csrepUploader: mockUploader,
      historyStore: mockHistoryStore,
      chunkWorkerPool: mockWorkerPool,
    });

    const sqliteMatch = {
      id: 'c35a86a7-afb1-48af-8a77-c17554cbe58d',
      faceit_id: '1-65af8c64-84a7-45c6-99a7-05f65cbaf3d0',
      map: 'de_dust2',
      score: '13:10',
      demo_size: 140,
    };

    await orchestrator.uploadMatches([sqliteMatch]);

    expect(mockDownloader.downloadDemoDirect).toHaveBeenCalled();
    expect(mockUploader.initMultipartDirect).toHaveBeenCalledWith(
      '1-65af8c64-84a7-45c6-99a7-05f65cbaf3d0.dem.zst',
      1024 * 1024,
      null
    );
    expect(mockUploader.completeUploadAndLinkDirect).toHaveBeenCalledWith(
      'tok_sql',
      'c35a86a7-afb1-48af-8a77-c17554cbe58d',
      'f_sql',
      null
    );
    expect(mockHistoryStore.add).toHaveBeenCalledWith('c35a86a7-afb1-48af-8a77-c17554cbe58d');
    expect(mockHistoryStore.updateStatus).toHaveBeenCalledWith('c35a86a7-afb1-48af-8a77-c17554cbe58d', 'uploaded', expect.anything());

    // Ensure progress events carry id and matchId
    expect(progressEvents.length).toBeGreaterThan(0);
    const lastProgress = progressEvents[progressEvents.length - 1];
    expect(lastProgress.id).toBe('c35a86a7-afb1-48af-8a77-c17554cbe58d');
    expect(lastProgress.chunkCurrent).toBe(10);
    expect(lastProgress.chunkTotal).toBe(28);
  });

  it('should update status to failed and notify historyStore when demo is missing or unauthenticated', async () => {
    const stateStore = new AppStateStore({ steamId: '76561198434644264' }, { has: () => false });
    const mockDownloader = {
      downloadDemoDirect: vi.fn(async () => null),
    };
    const mockHistoryStore = {
      has: vi.fn(() => false),
      add: vi.fn(),
      updateStatus: vi.fn(),
    };

    const orchestrator = new SyncOrchestrator({
      config: {},
      stateStore,
      browserManager: null,
      faceitApiClient: {},
      faceitDownloader: mockDownloader,
      csrepClient: {},
      csrepUploader: {},
      historyStore: mockHistoryStore,
      chunkWorkerPool: {},
    });

    const sqliteMatch = {
      id: 'match-fail-1',
      faceit_id: 'faceit-fail-1',
      map: 'de_ancient',
    };

    await orchestrator.uploadMatches([sqliteMatch]);

    expect(mockHistoryStore.updateStatus).toHaveBeenCalledWith(
      'match-fail-1',
      'failed',
      'Требуется авторизация в FACEIT'
    );
    expect(stateStore.state.stats.skipped).toBe(1);
  });
});
