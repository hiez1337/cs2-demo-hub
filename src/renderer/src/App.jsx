import React, { useState, useEffect, useCallback, useRef } from 'react';
import NavigationRail from './components/NavigationRail.jsx';
import TopHeader from './components/TopHeader.jsx';
import MetricsStrip from './components/MetricsStrip.jsx';
import MatchFeed from './components/MatchFeed.jsx';
import AuthModal from './components/AuthModal.jsx';
import EmptyState from './components/EmptyState.jsx';
import AnalyticsView from './components/AnalyticsView.jsx';
import {
  FolderArchive,
  BarChart3,
  Settings,
  Save,
  Check,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('sync');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTelemetrySpeed, setActiveTelemetrySpeed] = useState(0);

  // Settings State
  const [settingsState, setSettingsState] = useState({
    autoSync: true,
    concurrency: 4,
    chunkSizeMB: 5,
    notifications: true,
    downloadPath: 'C:\\CS2_Demos\\Downloads',
  });
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Auth state
  const [auth, setAuth] = useState({
    steam: {
      isConnected: false,
      steamId: '',
    },
    faceit: {
      isConnected: false,
      nickname: 'Гость',
    },
    dpapiProtected: false,
  });

  const uploadTimers = useRef({});

  // Stats calculation
  const missingCount = matches.filter(
    (m) => m.status === 'missing' || m.status === 'ready' || m.status === 'uploading' || m.status === 'paused'
  ).length;
  const uploadedCount = matches.filter((m) => m.status === 'uploaded').length;

  const activeMatch = matches.find((m) => m.status === 'uploading');
  const stats = {
    total: matches.length,
    missing: missingCount,
    uploaded: uploadedCount,
    speedMBs: activeMatch ? activeTelemetrySpeed : 0,
    activeWorkers: activeMatch?.stage === 'downloading' ? 10 : (settingsState.concurrency || 4),
    isStreaming: Boolean(activeMatch),
    stage: activeMatch?.stage || 'uploading',
  };

  // Check Electron API presence
  const electronApi = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
  const isElectron = Boolean(electronApi);

  // Initialize data from Electron API if available
  useEffect(() => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
    if (!api) return;

    async function loadElectronData() {
      try {
        if (api.getMatches) {
          const apiMatches = await api.getMatches();
          if (Array.isArray(apiMatches)) {
            setMatches(apiMatches);
          }
        }
        const getAuthFn = api.getAuthStatus || api.getAuth;
        if (getAuthFn) {
          const apiAuth = await getAuthFn();
          if (apiAuth) {
            setAuth({
              steam: {
                isConnected: Boolean(apiAuth?.steamConnected),
                steamId: apiAuth?.steamId || '',
              },
              faceit: {
                isConnected: Boolean(apiAuth?.faceitConnected),
                nickname: apiAuth?.faceitNickname || 'Гость',
              },
              dpapiProtected: Boolean(apiAuth?.dpapiProtected),
            });
          }
        }
      } catch (err) {
        console.error('Failed to load initial data from Electron API:', err);
      }
    }

    loadElectronData();

    // Listen to IPC updates
    const unsubscribeMatch = api.onMatchUpdated?.((updatedMatch) => {
      if (!updatedMatch?.id) return;
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id === updatedMatch.id || m.csrepMatchId === updatedMatch.id) {
            const nextStatus = updatedMatch.status || m.status;
            return {
              ...m,
              ...updatedMatch,
              status: nextStatus,
              error_message: updatedMatch.error || updatedMatch.error_message || (nextStatus === 'failed' ? (m.error_message || 'Ошибка загрузки') : null),
              progress: nextStatus === 'uploaded' ? 100 : (updatedMatch.progress ?? m.progress),
              speed_text: nextStatus === 'uploaded' || nextStatus === 'failed' || nextStatus === 'paused'
                ? ''
                : (updatedMatch.speed_text || m.speed_text),
            };
          }
          return m;
        })
      );
      const err = updatedMatch.error || updatedMatch.error_message;
      if (updatedMatch.status === 'failed' && err && err.toLowerCase().includes('авторизац')) {
        setIsAuthModalOpen(true);
      }
    });

    const unsubscribeProgress = api.onUploadProgress?.((progressData) => {
      const targetId = progressData?.id || progressData?.matchId;
      const filePercent = progressData?.percent ?? progressData?.filePercent ?? progressData?.progress?.filePercent;
      const chunkCurrent = progressData?.chunkCurrent ?? progressData?.chunksCompleted ?? progressData?.progress?.chunksCompleted;
      const chunkTotal = progressData?.chunkTotal ?? progressData?.chunksTotal ?? progressData?.progress?.chunksTotal;
      const speed = progressData?.speedMBs
        ? `${Number(progressData.speedMBs).toFixed(1)} МБ/с`
        : (progressData?.speedInfo || progressData?.speed_text);

      setMatches((prev) =>
        prev.map((m) => {
          const isTarget = targetId ? (m.id === targetId || m.csrepMatchId === targetId) : m.status === 'uploading';
          if (isTarget) {
            return {
              ...m,
              stage: progressData?.stage || m.stage || 'uploading',
              completed_mb: progressData?.completedMb || m.completed_mb,
              total_mb: progressData?.totalMb || m.total_mb,
              progress: typeof filePercent === 'number' ? filePercent : m.progress,
              chunk_current: typeof chunkCurrent === 'number' ? chunkCurrent : m.chunk_current,
              chunk_total: typeof chunkTotal === 'number' ? chunkTotal : (m.chunk_total || 15),
              speed_text: speed || m.speed_text || (progressData?.stage === 'downloading' ? '8.8 МБ/с' : '6.4 МБ/с'),
              status: filePercent >= 100 && progressData?.stage !== 'downloading' ? 'uploaded' : 'uploading',
            };
          }
          return m;
        })
      );
      if (progressData?.speedMBs) {
        setActiveTelemetrySpeed(progressData.speedMBs);
      }
    });

    return () => {
      if (typeof unsubscribeMatch === 'function') unsubscribeMatch();
      if (typeof unsubscribeProgress === 'function') unsubscribeProgress();
    };
  }, [isElectron]);

  // Simulation upload loop for mock mode
  const simulateUpload = useCallback((matchId) => {
    clearInterval(uploadTimers.current[matchId]);
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: 'uploading', speed_text: '31.8 МБ/с' } : m))
    );

    const interval = setInterval(() => {
      setMatches((prev) => {
        const target = prev.find((m) => m.id === matchId);
        if (!target || target.status !== 'uploading') {
          clearInterval(interval);
          delete uploadTimers.current[matchId];
          return prev;
        }

        const currentProg = target.progress || 0;
        const nextProg = Math.min(100, currentProg + Math.random() * 8 + 4);
        const totalChunks = target.chunk_total || 30;
        const currentChunk = Math.min(totalChunks, Math.floor((nextProg / 100) * totalChunks));

        if (nextProg >= 100) {
          clearInterval(interval);
          delete uploadTimers.current[matchId];
          return prev.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  progress: 100,
                  chunk_current: totalChunks,
                  status: 'uploaded',
                  speed_text: '',
                }
              : m
          );
        }

        return prev.map((m) =>
          m.id === matchId
            ? {
                ...m,
                progress: nextProg,
                chunk_current: currentChunk,
                speed_text: `${(28 + Math.random() * 6).toFixed(1)} МБ/с`,
              }
            : m
        );
      });
    }, 400);

    uploadTimers.current[matchId] = interval;
  }, []);

  // Handlers
  const handleUploadMatch = useCallback(
    (matchId) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? {
                ...m,
                status: 'uploading',
                speed_text: m.speed_text || '31.8 МБ/с',
                progress: m.progress && m.progress > 0 ? m.progress : 5,
                error_message: null,
              }
            : m
        )
      );
      const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
      if (api?.uploadMatch) {
        api.uploadMatch(matchId).then((res) => {
          if (res && res.success === false) {
            setMatches((prev) =>
              prev.map((m) =>
                m.id === matchId
                  ? {
                      ...m,
                      status: 'failed',
                      error_message: res.error || 'Ошибка загрузки',
                      speed_text: '',
                    }
                  : m
              )
            );
            if (res.authRequired) {
              setIsAuthModalOpen(true);
            }
          }
        }).catch((err) => {
          setMatches((prev) =>
            prev.map((m) =>
              m.id === matchId
                ? {
                    ...m,
                    status: 'failed',
                    error_message: err?.message || 'Ошибка запуска',
                    speed_text: '',
                  }
                : m
            )
          );
        });
      } else {
        simulateUpload(matchId);
      }
    },
    [isElectron, simulateUpload]
  );

  const handlePauseMatch = useCallback(
    (matchId) => {
      const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
      if (api?.pauseUpload) {
        api.pauseUpload(matchId);
      }
      clearInterval(uploadTimers.current[matchId]);
      delete uploadTimers.current[matchId];
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: 'paused', speed_text: '' } : m))
      );
    },
    [isElectron]
  );

  const handleRetryMatch = useCallback(
    (matchId) => {
      const target = matches.find((m) => m.id === matchId);
      if (target?.error_message && target.error_message.toLowerCase().includes('авторизац')) {
        setIsAuthModalOpen(true);
      }
      handleUploadMatch(matchId);
    },
    [handleUploadMatch, matches]
  );

  const handleOpenDetails = useCallback(
    (match) => {
      const url = `https://csrep.gg/match/${match.faceit_id || match.id}`;
      const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
      if (api?.openExternal) {
        api.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [isElectron]
  );

  const handleSyncAll = useCallback(async () => {
    setIsSyncing(true);
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
    if (api?.startSync) {
      try {
        await api.startSync();
      } catch (err) {
        console.error('Failed to sync all:', err);
      } finally {
        setIsSyncing(false);
      }
    } else {
      // Simulate sequential / batch uploads
      const missing = matches.filter((m) => m.status === 'missing' || m.status === 'ready');
      missing.forEach((m, idx) => {
        setTimeout(() => {
          simulateUpload(m.id);
        }, idx * 500);
      });
      setTimeout(() => {
        setIsSyncing(false);
      }, 1500);
    }
  }, [isElectron, matches, simulateUpload]);

  const handleRefresh = useCallback(async () => {
    setIsSyncing(true);
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
    if (api?.refreshMatches) {
      try {
        const refreshed = await api.refreshMatches();
        if (Array.isArray(refreshed)) {
          setMatches(refreshed);
        }
      } catch (err) {
        console.error('Failed to refresh matches:', err);
      } finally {
        setIsSyncing(false);
      }
    } else {
      setTimeout(() => {
        setIsSyncing(false);
      }, 700);
    }
  }, [isElectron]);

  const handleLoginSteam = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
    const loginFn = api?.loginSteam || api?.openSteamLogin;
    if (loginFn) {
      const res = await loginFn();
      if (res?.success && res.steamId) {
        setAuth((prev) => ({
          ...prev,
          steam: {
            isConnected: true,
            steamId: res.steamId,
          },
        }));
      }
      const getAuthFn = api?.getAuthStatus || api?.getAuth;
      if (getAuthFn) {
        const apiAuth = await getAuthFn();
        if (apiAuth) {
          setAuth({
            steam: {
              isConnected: Boolean(apiAuth?.steamConnected),
              steamId: apiAuth?.steamId || res?.steamId || '',
            },
            faceit: {
              isConnected: Boolean(apiAuth?.faceitConnected),
              nickname: apiAuth?.faceitNickname || 'Гость',
            },
            dpapiProtected: Boolean(apiAuth?.dpapiProtected),
          });
        }
      }
      if (api?.refreshMatches) {
        const refreshed = await api.refreshMatches();
        if (Array.isArray(refreshed)) {
          setMatches(refreshed);
        }
      }
    } else {
      setAuth((prev) => ({
        ...prev,
        steam: {
          isConnected: !prev?.steam?.isConnected,
          steamId: !prev?.steam?.isConnected ? '76561198000000000' : '',
        },
      }));
    }
  }, [isElectron]);

  const handleLoginFaceit = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window.electronAPI || window.api) : null;
    const loginFn = api?.loginFaceit || api?.openFaceitLogin;
    if (loginFn) {
      const res = await loginFn();
      if (res?.success) {
        const nick = res.faceitNickname || res.nickname || 'CS2 Player';
        setAuth((prev) => ({
          ...prev,
          faceit: {
            isConnected: true,
            nickname: nick,
          },
        }));
      }
      const getAuthFn = api?.getAuthStatus || api?.getAuth;
      if (getAuthFn) {
        const apiAuth = await getAuthFn();
        if (apiAuth) {
          setAuth({
            steam: {
              isConnected: Boolean(apiAuth?.steamConnected),
              steamId: apiAuth?.steamId || '',
            },
            faceit: {
              isConnected: Boolean(apiAuth?.faceitConnected),
              nickname: apiAuth?.faceitNickname || res?.faceitNickname || res?.nickname || 'Гость',
            },
            dpapiProtected: Boolean(apiAuth?.dpapiProtected),
          });
        }
      }
      if (api?.refreshMatches) {
        const refreshed = await api.refreshMatches();
        if (Array.isArray(refreshed)) {
          setMatches(refreshed);
        }
      }
    } else {
      setAuth((prev) => ({
        ...prev,
        faceit: {
          isConnected: !prev?.faceit?.isConnected,
          nickname: !prev?.faceit?.isConnected ? 'FACEIT Player' : 'Гость',
        },
      }));
    }
  }, [isElectron]);

  const handleLogoutSteam = useCallback(() => {
    setAuth((prev) => ({
      ...prev,
      steam: { isConnected: false, steamId: '' },
    }));
  }, []);

  const handleLogoutFaceit = useCallback(() => {
    setAuth((prev) => ({
      ...prev,
      faceit: { isConnected: false, nickname: 'Гость' },
    }));
  }, []);

  const handleSaveSettings = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  return (
    <div className="flex h-screen w-screen bg-[#121212] text-slate-100 overflow-hidden font-sans">
      {/* 64px Left Navigation Rail */}
      <NavigationRail
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userProfile={{
          nickname: auth?.faceit?.isConnected ? (auth?.faceit?.nickname || 'Подключен') : 'Гость',
          isConnected: Boolean(auth?.faceit?.isConnected),
          isOnline: Boolean(auth?.faceit?.isConnected),
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#121212]">
        {/* Top Header */}
        <TopHeader
          title="CS2 Demo Hub"
          statusText={
            auth?.faceit?.isConnected && auth?.steam?.isConnected
              ? 'CSREP & FACEIT Онлайн'
              : auth?.faceit?.isConnected
              ? 'FACEIT Онлайн'
              : auth?.steam?.isConnected
              ? 'Steam Онлайн'
              : 'Не подключен'
          }
          isOnline={Boolean(auth?.faceit?.isConnected || auth?.steam?.isConnected)}
          isSyncing={isSyncing}
          pendingCount={missingCount}
          onSyncAll={handleSyncAll}
          onRefresh={handleRefresh}
        />

        {/* Dynamic Content based on Active Tab */}
        {activeTab === 'sync' && (
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Metrics Strip */}
            <MetricsStrip stats={stats} />

            {/* Game Feed or Empty State */}
            {matches.length === 0 ? (
              <EmptyState
                onScan={handleRefresh}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                isSyncing={isSyncing}
                auth={auth}
              />
            ) : (
              <MatchFeed
                matches={matches}
                onUploadMatch={handleUploadMatch}
                onPauseMatch={handlePauseMatch}
                onOpenDetails={handleOpenDetails}
                onRetryMatch={handleRetryMatch}
                onRefresh={handleRefresh}
                onOpenAuth={() => setIsAuthModalOpen(true)}
                auth={auth}
                isSyncing={isSyncing}
              />
            )}
          </main>
        )}

        {/* Tab: Archive */}
        {activeTab === 'archive' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-[#121212]">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <FolderArchive className="w-6 h-6 text-[#0078D4]" />
                  Архив синхронизированных демок
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Все демки, сохранённые локально и в облачном хранилище Cloudflare R2
                </p>
              </div>
              <span className="text-xs font-mono font-bold bg-[#1c1c1c] px-3 py-1.5 rounded-none border border-white/10 text-white">
                {uploadedCount} ДЕМОК В ОБЛАКЕ
              </span>
            </div>

            {uploadedCount === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FolderArchive className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-white">В архиве пока нет загруженных демок</p>
                <p className="text-xs text-slate-500 mt-1">Синхронизируйте матчи во вкладке «Синхронизация»</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches
                  .filter((m) => m.status === 'uploaded')
                  .map((match) => (
                    <div
                      key={match.id || match.faceit_id}
                      className="p-4 rounded-none bg-[#1c1c1c] border border-white/10 flex flex-col justify-between space-y-3 hover:bg-[#222222] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm uppercase">{match.map}</span>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-none bg-[#107C41]/20 text-emerald-300 border border-[#107C41]/40">
                          {match.score || '—'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center justify-between font-mono">
                        <span className="font-bold text-slate-300">
                          {match.demo_size
                            ? typeof match.demo_size === 'number' && match.demo_size > 100000
                              ? `${(match.demo_size / (1024 * 1024)).toFixed(1)} МБ`
                              : `${match.demo_size} МБ`
                            : '—'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(match)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-none text-xs font-bold text-slate-200 bg-[#2d2d2d] hover:bg-[#3a3a3a] border border-white/10 transition-colors cursor-pointer"
                      >
                        <span>Открыть в CSREP</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Analytics */}
        {activeTab === 'analytics' && (
          <AnalyticsView
            matches={matches}
            stats={stats}
            auth={auth}
            onStartUploadAll={handleSyncAll}
            onNavigateToSync={() => setActiveTab('sync')}
          />
        )}

        {/* Tab: Settings */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-3xl bg-[#121212]">
            <div className="pb-4 border-b border-white/10">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Settings className="w-6 h-6 text-[#0078D4]" />
                Настройки приложения
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Параметры параллельной выгрузки, локального кэша и интеграций
              </p>
            </div>

            <div className="space-y-3.5">
              {/* Parallel Concurrency */}
              <div className="p-4 rounded-none bg-[#1c1c1c] border border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Параллельные потоки R2</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Количество одновременных воркеров загрузки чанков
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-[#0078D4]">
                    {settingsState.concurrency} потока
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={settingsState.concurrency}
                    onChange={(e) =>
                      setSettingsState((prev) => ({ ...prev, concurrency: Number(e.target.value) }))
                    }
                    className="w-32 accent-[#0078D4]"
                  />
                </div>
              </div>

              {/* Chunk Size */}
              <div className="p-4 rounded-none bg-[#1c1c1c] border border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Размер одного чанка</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Рекомендуемый размер multipart чанка для Cloudflare R2
                  </p>
                </div>
                <select
                  value={settingsState.chunkSizeMB}
                  onChange={(e) =>
                    setSettingsState((prev) => ({ ...prev, chunkSizeMB: Number(e.target.value) }))
                  }
                  className="bg-[#161616] border border-white/10 text-xs text-slate-200 rounded-none px-3 py-1.5 focus:border-[#0078D4] focus:outline-none"
                >
                  <option value={5}>5 МБ (Стандарт R2)</option>
                  <option value={10}>10 МБ (Быстрый интернет)</option>
                  <option value={20}>20 МБ (Гигабит)</option>
                </select>
              </div>

              {/* Auto Sync Toggle */}
              <div className="p-4 rounded-none bg-[#1c1c1c] border border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Автоматическая синхронизация</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Фоновая проверка новых матчей FACEIT каждые 5 минут
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettingsState((prev) => ({ ...prev, autoSync: !prev.autoSync }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-none border border-white/10 transition-colors cursor-pointer ${
                    settingsState.autoSync ? 'bg-[#0078D4]' : 'bg-[#2d2d2d]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-none bg-white transition-transform ${
                      settingsState.autoSync ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Save Settings */}
              <div className="pt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-5 py-2 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer"
                >
                  {settingsSaved ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Сохранено!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 text-white" />
                      <span>Сохранить настройки</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Account Management Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        auth={auth}
        onLoginSteam={handleLoginSteam}
        onLoginFaceit={handleLoginFaceit}
        onLogoutSteam={handleLogoutSteam}
        onLogoutFaceit={handleLogoutFaceit}
      />
    </div>
  );
}
