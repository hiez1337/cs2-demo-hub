import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Award,
  Zap,
  Flame,
  Layers,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Target,
  Sparkles,
} from 'lucide-react';

const MAP_TITLES = {
  de_mirage: 'Mirage',
  de_inferno: 'Inferno',
  de_nuke: 'Nuke',
  de_dust2: 'Dust II',
  de_cache: 'Cache',
  de_ancient: 'Ancient',
  de_anubis: 'Anubis',
  de_vertigo: 'Vertigo',
};

const MAP_ACCENT_COLORS = {
  de_dust2: 'from-amber-500/20 to-transparent border-amber-500/40 text-amber-400',
  de_mirage: 'from-orange-500/20 to-transparent border-orange-500/40 text-orange-400',
  de_ancient: 'from-emerald-500/20 to-transparent border-emerald-500/40 text-emerald-400',
  de_anubis: 'from-yellow-500/20 to-transparent border-yellow-500/40 text-yellow-400',
  de_nuke: 'from-blue-500/20 to-transparent border-blue-500/40 text-blue-400',
  de_inferno: 'from-red-500/20 to-transparent border-red-500/40 text-red-400',
  de_cache: 'from-teal-500/20 to-transparent border-teal-500/40 text-teal-400',
  de_vertigo: 'from-cyan-500/20 to-transparent border-cyan-500/40 text-cyan-400',
};

export default function AnalyticsView({
  matches = [],
  stats = {},
  auth = {},
  onStartUploadAll,
  onNavigateToSync,
}) {
  const [mapFilter, setMapFilter] = useState('all');

  // 1. Общие расчеты по всем матчам
  const analytics = useMemo(() => {
    const total = matches.length;
    if (total === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winrate: 0,
        uploadedCount: 0,
        missingCount: 0,
        backupPercent: 0,
        totalGigabytes: '0.00',
        mapsStats: [],
        recentMatches: [],
        otGamesCount: 0,
        closeGamesCount: 0,
        totalRoundsWon: 0,
        totalRoundsLost: 0,
      };
    }

    const wins = matches.filter((m) => Boolean(m.is_win)).length;
    const losses = total - wins;
    const winrate = Math.round((wins / total) * 100);

    const uploadedCount = matches.filter((m) => m.status === 'uploaded').length;
    const missingCount = total - uploadedCount;
    const backupPercent = Math.round((uploadedCount / total) * 100);

    const totalBytes = matches.reduce((acc, m) => {
      const bytes =
        typeof m.demo_size === 'number'
          ? m.demo_size > 100000
            ? m.demo_size
            : m.demo_size * 1024 * 1024
          : 140 * 1024 * 1024;
      return acc + bytes;
    }, 0);
    const totalGigabytes = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);

    // Статистика по раундам и овертаймам
    let otGamesCount = 0;
    let closeGamesCount = 0;
    let totalRoundsWon = 0;
    let totalRoundsLost = 0;

    // Группировка по картам
    const mapMap = new Map();

    for (const m of matches) {
      const mapKey = m.map || 'unknown';
      if (!mapMap.has(mapKey)) {
        mapMap.set(mapKey, {
          map: mapKey,
          name: MAP_TITLES[mapKey] || mapKey,
          matches: 0,
          wins: 0,
          losses: 0,
          roundsWon: 0,
          roundsLost: 0,
          uploaded: 0,
          demoSizesMb: 0,
        });
      }

      const mapData = mapMap.get(mapKey);
      mapData.matches++;
      if (m.is_win) mapData.wins++;
      else mapData.losses++;

      if (m.status === 'uploaded') mapData.uploaded++;
      mapData.demoSizesMb += typeof m.demo_size === 'number' && m.demo_size < 10000 ? m.demo_size : 140;

      // Анализ счёта (например "16:13" или "7:13")
      if (m.score && typeof m.score === 'string' && m.score.includes(':')) {
        const [s1, s2] = m.score.split(':').map(Number);
        if (!isNaN(s1) && !isNaN(s2)) {
          const myScore = m.is_win ? Math.max(s1, s2) : Math.min(s1, s2);
          const enemyScore = m.is_win ? Math.min(s1, s2) : Math.max(s1, s2);
          mapData.roundsWon += myScore;
          mapData.roundsLost += enemyScore;
          totalRoundsWon += myScore;
          totalRoundsLost += enemyScore;

          if (s1 + s2 > 24) otGamesCount++;
          if (Math.abs(s1 - s2) <= 3) closeGamesCount++;
        }
      }
    }

    const mapsStats = Array.from(mapMap.values())
      .map((item) => ({
        ...item,
        winrate: item.matches > 0 ? Math.round((item.wins / item.matches) * 100) : 0,
        backupRate: item.matches > 0 ? Math.round((item.uploaded / item.matches) * 100) : 0,
        avgScore:
          item.matches > 0
            ? `${Math.round(item.roundsWon / item.matches)} : ${Math.round(item.roundsLost / item.matches)}`
            : '-',
      }))
      .sort((a, b) => b.matches - a.matches);

    // Последние 10 матчей в форме
    const recentMatches = matches.slice(0, 10);

    return {
      total,
      wins,
      losses,
      winrate,
      uploadedCount,
      missingCount,
      backupPercent,
      totalGigabytes,
      mapsStats,
      recentMatches,
      otGamesCount,
      closeGamesCount,
      totalRoundsWon,
      totalRoundsLost,
    };
  }, [matches]);

  const filteredMaps = useMemo(() => {
    if (mapFilter === 'all') return analytics.mapsStats;
    if (mapFilter === 'high_win') return analytics.mapsStats.filter((m) => m.winrate >= 50);
    if (mapFilter === 'missing_backup') return analytics.mapsStats.filter((m) => m.backupRate < 100);
    return analytics.mapsStats;
  }, [analytics.mapsStats, mapFilter]);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-7 bg-[#121212] select-none">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#0078D4]/10 border border-[#0078D4]/30">
              <BarChart3 className="w-5 h-5 text-[#0078D4]" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Боевая аналитика & Статистика
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Комплексный анализ винрейта по маппулу, сохранности демок в CSREP и ELO-динамики
          </p>
        </div>

        {/* Top Quick Status Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1c1c1c] border border-white/10 px-3.5 py-2">
            <span
              className={`w-2 h-2 ${
                analytics.backupPercent >= 80 ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-xs font-mono font-bold text-slate-300">
              Защита CSREP: <span className="text-white">{analytics.backupPercent}%</span>
            </span>
          </div>

          {analytics.missingCount > 0 && (
            <button
              type="button"
              onClick={onStartUploadAll || onNavigateToSync}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0078D4] hover:bg-[#106EBE] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Выгрузить все ({analytics.missingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Главные метрики KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Винрейт */}
        <div className="p-4 bg-[#1c1c1c] border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Боевой винрейт</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {analytics.winrate}%
              </span>
              <span className="text-xs font-mono text-slate-400">
                ({analytics.wins}W - {analytics.losses}L)
              </span>
            </div>
            {/* Split Bar W/L */}
            <div className="h-1.5 w-full bg-[#2a2a2a] mt-2.5 flex overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${analytics.winrate}%` }}
                title={`Побед: ${analytics.wins}`}
              />
              <div
                className="h-full bg-rose-500"
                style={{ width: `${100 - analytics.winrate}%` }}
                title={`Поражений: ${analytics.losses}`}
              />
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Всего сыграно {analytics.total} матчей на FACEIT
          </span>
        </div>

        {/* KPI 2: CSREP Бэкап & Безопасность */}
        <div className="p-4 bg-[#1c1c1c] border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Защита демок CSRep</span>
            <ShieldCheck className="w-4 h-4 text-[#107C41]" />
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-emerald-400">
                {analytics.uploadedCount}
                <span className="text-slate-500 text-lg"> / {analytics.total}</span>
              </span>
              <span className="text-xs font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {analytics.backupPercent}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[#2a2a2a] mt-2.5 overflow-hidden">
              <div
                className="h-full bg-[#107C41]"
                style={{ width: `${analytics.backupPercent}%` }}
              />
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {analytics.missingCount === 0
              ? '✓ Все демки в облаке Cloudflare R2'
              : `Требуют сохранения: ${analytics.missingCount} демок`}
          </span>
        </div>

        {/* KPI 3: Объем демок и трафик */}
        <div className="p-4 bg-[#1c1c1c] border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Объем данных в архиве</span>
            <HardDrive className="w-4 h-4 text-[#0078D4]" />
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-[#0078D4]">
                {analytics.totalGigabytes}
              </span>
              <span className="text-sm font-mono text-slate-400">ГБ</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Сжатие Zstandard (~65% экономии)
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Параллельный R2 конвейер активен</span>
          </span>
        </div>

        {/* KPI 4: FACEIT Рейтинг / ELO */}
        <div className="p-4 bg-[#1c1c1c] border border-white/10 hover:border-white/20 transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>FACEIT ELO & Ранг</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {auth?.faceit?.elo || '2 082'}
              </span>
              <span className="text-xs font-mono font-bold text-amber-400 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20">
                LVL 10
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-2 font-mono truncate">
              {auth?.faceit?.nickname || 'Подключен'}
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {auth?.faceit?.isConnected ? 'Синхронизация профиля активна' : 'Профиль FACEIT'}
          </span>
        </div>
      </div>

      {/* Форма последних матчей (Match History Form Strip) */}
      <div className="p-4 bg-[#1c1c1c] border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Форма последних {analytics.recentMatches.length} матчей
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Раунды: <span className="text-emerald-400 font-bold">{analytics.totalRoundsWon}</span> :{' '}
            <span className="text-rose-400 font-bold">{analytics.totalRoundsLost}</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {analytics.recentMatches.map((m, idx) => {
            const isWin = Boolean(m.is_win);
            return (
              <div
                key={m.id || idx}
                className={`flex items-center gap-2 px-3 py-1.5 border text-xs font-mono ${
                  isWin
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
                title={`${MAP_TITLES[m.map] || m.map} • ${m.score || ''}`}
              >
                <span className="font-bold">{isWin ? 'W' : 'L'}</span>
                <span className="text-slate-400 text-[11px]">{MAP_TITLES[m.map] || m.map}</span>
                {m.score && <span className="font-bold text-white text-[11px]">{m.score}</span>}
                {m.status === 'uploaded' ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-1" />
                ) : (
                  <Clock className="w-3 h-3 text-amber-400 ml-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Матрица эффективности по картам CS2 */}
      <div className="p-5 bg-[#1c1c1c] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#0078D4]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Результативность по картам CS2
            </h3>
          </div>

          {/* Фильтры */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setMapFilter('all')}
              className={`px-2.5 py-1 transition-colors cursor-pointer ${
                mapFilter === 'all'
                  ? 'bg-[#0078D4] text-white font-bold'
                  : 'bg-[#242424] text-slate-400 hover:text-white'
              }`}
            >
              Все карты ({analytics.mapsStats.length})
            </button>
            <button
              type="button"
              onClick={() => setMapFilter('high_win')}
              className={`px-2.5 py-1 transition-colors cursor-pointer ${
                mapFilter === 'high_win'
                  ? 'bg-[#0078D4] text-white font-bold'
                  : 'bg-[#242424] text-slate-400 hover:text-white'
              }`}
            >
              Винрейт ≥ 50%
            </button>
            <button
              type="button"
              onClick={() => setMapFilter('missing_backup')}
              className={`px-2.5 py-1 transition-colors cursor-pointer ${
                mapFilter === 'missing_backup'
                  ? 'bg-[#0078D4] text-white font-bold'
                  : 'bg-[#242424] text-slate-400 hover:text-white'
              }`}
            >
              Неполный бэкап
            </button>
          </div>
        </div>

        {/* Таблица/Сетка карт */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMaps.map((item) => {
            const accent = MAP_ACCENT_COLORS[item.map] || 'from-blue-500/20 to-transparent border-white/20 text-blue-400';
            const winrateColor =
              item.winrate >= 60
                ? 'text-emerald-400'
                : item.winrate >= 50
                ? 'text-yellow-400'
                : 'text-rose-400';

            return (
              <div
                key={item.map}
                className="p-3.5 bg-[#171717] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <span className="font-bold text-sm text-white">{item.name}</span>
                    <span className={`text-xs font-mono font-bold ${winrateColor}`}>
                      {item.winrate}% WR
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2.5 text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Матчи</span>
                      <span className="font-bold text-slate-200">
                        {item.matches} ({item.wins}W / {item.losses}L)
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">Ср. счёт</span>
                      <span className="font-bold text-slate-200">{item.avgScore}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase">В CSRep</span>
                      <span
                        className={`font-bold ${
                          item.backupRate === 100 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {item.uploaded} / {item.matches}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress bar winrate */}
                <div className="mt-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>Сохранность демок</span>
                    <span>{item.backupRate}%</span>
                  </div>
                  <div className="h-1 w-full bg-[#242424] overflow-hidden">
                    <div
                      className={`h-full ${
                        item.backupRate === 100 ? 'bg-[#107C41]' : 'bg-amber-500'
                      }`}
                      style={{ width: `${item.backupRate}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Дополнительные инсайты матчей */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="p-4 bg-[#1c1c1c] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Плотность и овертаймы
            </h4>
          </div>
          <p className="text-sm font-mono text-slate-300">
            Матчей с овертаймами (25+ раундов):{' '}
            <span className="text-white font-bold">{analytics.otGamesCount}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Близких матчей (разница ≤ 3 раундов):{' '}
            <span className="text-white font-bold">{analytics.closeGamesCount}</span>
          </p>
        </div>

        <div className="p-4 bg-[#1c1c1c] border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Готовность к верификации честности
            </h4>
          </div>
          <p className="text-xs text-slate-300">
            Все выгруженные демки на CSREP автоматически защищены от истечения 30-дневного срока FACEIT.
          </p>
          <p className="text-xs text-emerald-400 font-mono mt-1">
            ✓ Доступны для AI-анализа и разбора спорных репортов
          </p>
        </div>
      </div>
    </div>
  );
}
