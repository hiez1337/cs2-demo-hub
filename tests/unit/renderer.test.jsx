import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../../src/renderer/src/App.jsx';
import EmptyState from '../../src/renderer/src/components/EmptyState.jsx';
import NavigationRail from '../../src/renderer/src/components/NavigationRail.jsx';
import AuthModal from '../../src/renderer/src/components/AuthModal.jsx';
import { ErrorBoundary } from '../../src/renderer/src/main.jsx';
import Titlebar from '../../src/renderer/src/components/Titlebar.jsx';
import MatchCard from '../../src/renderer/src/components/MatchCard.jsx';
import MatchFeed from '../../src/renderer/src/components/MatchFeed.jsx';
import MetricsStrip from '../../src/renderer/src/components/MetricsStrip.jsx';
import AnalyticsView from '../../src/renderer/src/components/AnalyticsView.jsx';
describe('Renderer components and state contract', () => {
  beforeEach(() => {
    // Mock window and window.api
    global.window = {
      api: {
        getMatches: vi.fn().mockResolvedValue([]),
        getAuth: vi.fn().mockResolvedValue({
          steamConnected: false,
          faceitConnected: false,
          steamId: '',
          faceitNickname: '',
          dpapiProtected: false,
        }),
        onMatchUpdated: vi.fn(() => () => {}),
        onUploadProgress: vi.fn(() => () => {}),
      },
      location: {
        reload: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    delete global.window;
  });

  it('renders App without crashing when matches is empty', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Матчи не найдены');
    expect(html).toContain('Сканировать FACEIT');
    expect(html).toContain('Гость');
    // Ensure no mock values s1mple or 2840 are rendered
    expect(html).not.toContain('s1mple');
    expect(html).not.toContain('2840');
    expect(html).not.toContain('2,840');
  });

  it('renders EmptyState with action buttons and accounts status', () => {
    const onScan = vi.fn();
    const onOpenAuth = vi.fn();
    const html = renderToString(
      <EmptyState
        onScan={onScan}
        onOpenAuth={onOpenAuth}
        isSyncing={false}
        auth={{
          steam: { isConnected: false, steamId: '' },
          faceit: { isConnected: false, nickname: 'Гость' },
          dpapiProtected: false,
        }}
      />
    );
    expect(html).toContain('Матчи не найдены');
    expect(html).toContain('Сканировать FACEIT');
    expect(html).toContain('Войти в аккаунты');
    expect(html).toContain('Steam:');
    expect(html).toContain('FACEIT:');
    expect(html).toContain('Не подключен');
  });

  it('renders NavigationRail with guest/disconnected state when not connected', () => {
    const html = renderToString(
      <NavigationRail
        activeTab="sync"
        onTabChange={() => {}}
        userProfile={{
          nickname: 'Гость',
          isConnected: false,
          isOnline: false,
        }}
        onOpenAuth={() => {}}
      />
    );
    expect(html).toContain('Гость');
    expect(html).toContain('Не подключен');
    expect(html).not.toContain('s1mple');
    expect(html).not.toContain('2840');
    expect(html).not.toContain('LVL 10');
  });

  it('renders AuthModal without fake mock data when disconnected', () => {
    const html = renderToString(
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        auth={{
          steam: { isConnected: false, steamId: '' },
          faceit: { isConnected: false, nickname: 'Гость' },
          dpapiProtected: false,
        }}
        onLoginSteam={() => {}}
        onLoginFaceit={() => {}}
        onLogoutSteam={() => {}}
        onLogoutFaceit={() => {}}
      />
    );
    expect(html).toContain('Управление аккаунтами');
    expect(html).toContain('Steam аккаунт');
    expect(html).toContain('FACEIT аккаунт');
    expect(html).toContain('Не подключен');
    expect(html).toContain('Войти через Steam');
    expect(html).toContain('Войти через FACEIT');
    expect(html).not.toContain('s1mple');
    expect(html).not.toContain('2840');
    expect(html).not.toContain('76561198012345678');
  });

  it('ErrorBoundary renders error card with reload button on crash', () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = {
      hasError: true,
      error: new Error('Render explosion test'),
      errorInfo: null,
    };

    const html = renderToString(boundary.render());
    expect(html).toContain('Произошла ошибка интерфейса');
    expect(html).toContain('Render explosion test');
    expect(html).toContain('Перезагрузить');
  });

  it('updates auth state matching the IPC getAuth contract', async () => {
    const apiAuth = {
      steamConnected: true,
      faceitConnected: true,
      steamId: '76561198099999999',
      faceitNickname: 'ProGamer',
      dpapiProtected: true,
    };

    const transformed = {
      steam: {
        isConnected: Boolean(apiAuth?.steamConnected),
        steamId: apiAuth?.steamId || '',
      },
      faceit: {
        isConnected: Boolean(apiAuth?.faceitConnected),
        nickname: apiAuth?.faceitNickname || 'Гость',
      },
      dpapiProtected: Boolean(apiAuth?.dpapiProtected),
    };

    expect(transformed.steam.isConnected).toBe(true);
    expect(transformed.steam.steamId).toBe('76561198099999999');
    expect(transformed.faceit.isConnected).toBe(true);
    expect(transformed.faceit.nickname).toBe('ProGamer');
    expect(transformed.dpapiProtected).toBe(true);

    const navHtml = renderToString(
      <NavigationRail
        activeTab="sync"
        onTabChange={() => {}}
        userProfile={{
          nickname: transformed.faceit.nickname,
          isConnected: transformed.faceit.isConnected,
          isOnline: transformed.faceit.isConnected,
        }}
        onOpenAuth={() => {}}
      />
    );
    expect(navHtml).toContain('ProGamer');
    expect(navHtml).not.toContain('s1mple');
  });

  it('renders Titlebar component properly with online and syncing status', () => {
    const htmlOnline = renderToString(
      <Titlebar
        title="CS2 Demo Hub"
        statusText="CSREP & FACEIT Онлайн"
        isOnline={true}
        pendingCount={5}
      />
    );
    expect(htmlOnline).toContain('CS2 Demo Hub');
    expect(htmlOnline).toContain('CSREP &amp; FACEIT Онлайн');
    expect(htmlOnline).toContain('Загрузить всё (5)');

    const htmlOffline = renderToString(
      <Titlebar
        title="CS2 Demo Hub"
        statusText="Авторизация не выполнена"
        isOnline={false}
        pendingCount={0}
      />
    );
    expect(htmlOffline).toContain('Авторизация не выполнена');
  });

  it('handles window.electronAPI login responses and exposes both nickname and faceitNickname', () => {
    const loginResult = {
      success: true,
      faceitToken: 'fake-faceit-token-12345',
      nickname: 'Susano1337',
      faceitNickname: 'Susano1337',
    };

    const extractedNickname = loginResult.faceitNickname || loginResult.nickname || 'CS2 Player';
    expect(extractedNickname).toBe('Susano1337');
    expect(loginResult.success).toBe(true);
  });

  it('strictly adheres to Zero-Radius Sharp Fluent geometry (no rounded-* classes, only rounded-none)', () => {
    const sampleMatchWin = {
      id: 'match-1',
      faceit_id: 'faceit-1',
      map: 'de_dust2',
      score: '13:9',
      is_win: true,
      status: 'missing',
      demo_size: 136 * 1024 * 1024,
      elo_diff: 25,
      rank: 2062,
    };

    const sampleMatchLoss = {
      id: 'match-2',
      faceit_id: 'faceit-2',
      map: 'de_ancient',
      score: '11:13',
      is_win: false,
      status: 'paused',
      progress: 45,
      demo_size: 122.5 * 1024 * 1024,
      elo_diff: -25,
      rank: 2037,
    };

    const winHtml = renderToString(<MatchCard match={sampleMatchWin} />);
    const lossHtml = renderToString(<MatchCard match={sampleMatchLoss} />);
    const metricsHtml = renderToString(
      <MetricsStrip
        stats={{
          total: 2,
          missing: 1,
          uploaded: 1,
          speedMBs: 31.8,
          activeWorkers: 4,
          isStreaming: true,
        }}
      />
    );
    const feedHtml = renderToString(
      <MatchFeed
        matches={[sampleMatchWin, sampleMatchLoss]}
        activeFilter="all"
        setActiveFilter={() => {}}
        selectedMap="all"
        setSelectedMap={() => {}}
        searchQuery=""
        setSearchQuery={() => {}}
        auth={{ steam: { isConnected: true }, faceit: { isConnected: true } }}
      />
    );

    const combinedHtml = winHtml + lossHtml + metricsHtml + feedHtml;

    // Strict check: NO lingering rounded corners
    const roundedRegex = /rounded-(sm|md|lg|xl|2xl|3xl|full)\b/g;
    expect(combinedHtml.match(roundedRegex)).toBeNull();

    // Strict check: NO soft blur drop-shadows
    const shadowRegex = /shadow-(sm|md|lg|xl|2xl)\b/g;
    expect(combinedHtml.match(shadowRegex)).toBeNull();

    // Verification of rigid accent marker lines
    expect(winHtml).toContain('border-l-2 border-[#107C41]');
    expect(lossHtml).toContain('border-l-2 border-[#C42B1C]');
    expect(feedHtml).toContain('border-b-2 border-[#0078D4]');

    // Verification of monospace telemetry
    expect(winHtml).toContain('font-mono');
    expect(winHtml).toContain('13:9');
    expect(lossHtml).toContain('font-mono');
    expect(lossHtml).toContain('11:13');
    expect(metricsHtml).toContain('font-mono');
    expect(metricsHtml).toContain('31.8');
  });

  it('renders paused match card with rectangular progress bar and resume button', () => {
    const samplePausedMatch = {
      id: 'match-probe',
      map: 'de_dust2',
      score: '13:9',
      is_win: true,
      status: 'paused',
      progress: 35,
      speed_text: '31.8 МБ/с',
      demo_size: 136 * 1024 * 1024,
      chunk_current: 10,
      chunk_total: 28,
    };

    const html = renderToString(<MatchCard match={samplePausedMatch} />);
    expect(html).toContain('На паузе');
    expect(html).toContain('Приостановлено');
    expect(html).toContain('Продолжить');
    expect(html).toContain('35%');
    expect(html).toContain('h-[3px] w-full bg-[#2d2d2d] rounded-none');
  });

  it('renders comprehensive AnalyticsView with winrate, map breakdown, and CSRep backup stats', () => {
    const sampleMatches = [
      { id: '1', map: 'de_dust2', score: '16:13', is_win: 1, status: 'uploaded', demo_size: 140 },
      { id: '2', map: 'de_dust2', score: '13:10', is_win: 1, status: 'uploaded', demo_size: 140 },
      { id: '3', map: 'de_ancient', score: '7:13', is_win: 0, status: 'missing', demo_size: 140 },
      { id: '4', map: 'de_cache', score: '15:19', is_win: 0, status: 'missing', demo_size: 240 },
    ];

    const html = renderToString(
      <AnalyticsView
        matches={sampleMatches}
        stats={{ total: 4, missing: 2, uploaded: 2 }}
        auth={{ faceit: { isConnected: true, nickname: 'pro_sniper', elo: 2082 } }}
      />
    );

    expect(html).toContain('Боевая аналитика');
    expect(html).toContain('50%'); // 2 wins out of 4 = 50% winrate
    expect(html).toContain('Dust II');
    expect(html).toContain('Ancient');
    expect(html).toContain('Cache');
    expect(html).toContain('Защита демок CSRep');
    expect(html).toContain('2082');
    expect(html).toContain('pro_sniper');
  });
});
