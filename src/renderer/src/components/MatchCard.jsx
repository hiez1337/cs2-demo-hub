import React from 'react';
import {
  Upload,
  Download,
  Pause,
  ExternalLink,
  RotateCcw,
  HardDrive,
  Layers,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
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

export default function MatchCard({
  match,
  onUpload,
  onPause,
  onOpenDetails,
  onRetry,
}) {
  const mapKey = (match.map || 'de_mirage').toLowerCase().trim();
  const mapTitle = MAP_TITLES[mapKey] || match.map || 'Mirage';

  const isWin = Boolean(match.is_win);
  const status = match.status || 'missing'; // 'ready' | 'missing' | 'uploading' | 'uploaded' | 'failed' | 'paused'
  const isUploading = status === 'uploading';
  const isUploaded = status === 'uploaded';
  const isFailed = status === 'failed';
  const isPaused = status === 'paused';
  const progress = Number(match.progress || (isUploaded ? 100 : 0));
  const sizeInMB =
    typeof match.demo_size === 'number'
      ? match.demo_size > 100000
        ? match.demo_size / (1024 * 1024)
        : match.demo_size
      : typeof match.demo_size === 'string' && !isNaN(Number(match.demo_size))
      ? Number(match.demo_size) > 100000
        ? Number(match.demo_size) / (1024 * 1024)
        : Number(match.demo_size)
      : 140.0;

  const totalChunks = match.chunk_total || Math.ceil(sizeInMB / 5) || 28;
  const currentChunk = match.chunk_current || (isUploaded ? totalChunks : 0);
  const formattedSize = `${sizeInMB.toFixed(1)} МБ`;

  // Format ELO difference
  const eloDiff = match.elo_diff !== undefined ? match.elo_diff : null;
  const eloText =
    eloDiff !== null
      ? eloDiff > 0
        ? `+${eloDiff} ELO`
        : `${eloDiff} ELO`
      : match.rank
      ? `${match.rank} ELO`
      : '—';

  const dateFormatted =
    match.date_formatted ||
    (match.date
      ? new Date(match.date).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Недавно');

  return (
    <article
      className={`group relative rounded-none p-4 bg-[#1c1c1c] hover:bg-[#222222] transition-colors border-t border-r border-b border-white/10 ${
        isWin ? 'border-l-2 border-[#107C41]' : 'border-l-2 border-[#C42B1C]'
      }`}
    >
      {/* Header: Map Title & Score Badge */}
      <div className="relative flex items-center justify-between mb-3">
        {/* Map Badge */}
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-sans">
                {mapTitle}
              </h3>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none bg-[#2d2d2d] text-slate-300 border border-white/10 uppercase">
                {mapKey}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 mt-0.5">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{dateFormatted}</span>
            </div>
          </div>
        </div>

        {/* Score Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-bold font-mono tracking-tight border ${
              isWin
                ? 'bg-[#107C41]/15 border-[#107C41]/50 text-emerald-300'
                : 'bg-[#C42B1C]/15 border-[#C42B1C]/50 text-rose-300'
            }`}
          >
            <span className="text-white text-sm font-black font-mono">
              {match.score || '—'}
            </span>
            <span className="text-[11px] uppercase tracking-wider font-sans font-semibold">
              {isWin ? 'Победа' : 'Поражение'}
            </span>
          </div>
        </div>
      </div>

      {/* Match Specs Grid: Размер, Чанки, ELO */}
      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-none bg-[#161616] border border-white/10 mb-3 text-xs">
        {/* Demo Size */}
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-slate-500" />
            Размер
          </span>
          <span className="text-xs font-mono font-bold text-slate-200 mt-0.5">
            {formattedSize}
          </span>
        </div>

        {/* Chunks */}
        <div className="flex flex-col border-x border-white/10 px-2">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-500" />
            Чанки
          </span>
          <span className="text-xs font-mono font-bold text-slate-200 mt-0.5">
            {currentChunk} / {totalChunks}
          </span>
        </div>

        {/* ELO */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-slate-500" />
            FACEIT ELO
          </span>
          <span
            className={`text-xs font-mono font-black mt-0.5 ${
              eloDiff === null
                ? 'text-slate-400'
                : eloDiff > 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {eloText}
          </span>
        </div>
      </div>

      {/* Progress Bar (Active for uploading or paused) */}
      {(isUploading || isPaused) && (
        <div className="relative mb-3.5 p-2 bg-[#141414] border border-white/10 rounded-none">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mb-1.5">
            <span className="flex items-center gap-1.5 font-bold">
              <span
                className={`w-2 h-2 rounded-none ${
                  isUploading ? (match.stage === 'downloading' ? 'bg-[#0078D4] animate-pulse' : 'bg-emerald-400 animate-pulse') : 'bg-amber-500'
                }`}
              />
              {isUploading ? (
                match.stage === 'downloading' ? (
                  <span className="text-cyan-400 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачивание с FACEIT (10 потоков)</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Отправка в CSREP R2 (Чанк {match.chunk_current || 1}/{match.chunk_total || 15})</span>
                  </span>
                )
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Pause className="w-3.5 h-3.5" />
                  <span>На паузе</span>
                </span>
              )}
            </span>

            <div className="flex items-center gap-2 font-bold font-mono">
              {match.completed_mb && match.total_mb ? (
                <span className="text-slate-400 text-[10px]">
                  {match.completed_mb} / {match.total_mb} МБ
                </span>
              ) : null}
              <span className={match.stage === 'downloading' ? 'text-cyan-400' : 'text-emerald-400'}>
                {match.speed_text || (match.stage === 'downloading' ? '8.8 МБ/с' : '6.4 МБ/с')}
              </span>
              <span className="text-white bg-[#222222] px-1.5 py-0.5 rounded-none border border-white/10">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          <div className="h-[3px] w-full bg-[#2d2d2d] rounded-none overflow-hidden relative">
            <div
              className={`h-full rounded-none transition-all duration-150 relative ${
                isUploading
                  ? match.stage === 'downloading'
                    ? 'bg-gradient-to-r from-[#0078D4] to-cyan-400'
                    : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            >
              {isUploading && (
                <div className="absolute inset-0 bg-white/25 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Actions Row */}
      <div className="flex items-center justify-between pt-1">
        {/* Status text */}
        <div className="flex items-center gap-1.5 text-xs">
          {isUploaded && (
            <span className="flex items-center gap-1 text-[#107C41] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              В облаке CSREP
            </span>
          )}
          {isPaused && (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              ⏸ Приостановлено
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              {match.error_message || 'Ошибка загрузки'}
            </span>
          )}
          {(status === 'ready' || status === 'missing') && (
            <span className="text-slate-400 font-medium text-[11px]">
              Готово к выгрузке
            </span>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {isUploaded && (
            <button
              type="button"
              onClick={() => onOpenDetails && onOpenDetails(match)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-semibold text-slate-200 bg-[#2d2d2d] hover:bg-[#3a3a3a] border border-white/10 transition-colors cursor-pointer"
            >
              <span>Открыть</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {isUploading && (
            <button
              type="button"
              onClick={() => onPause && onPause(match.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-bold text-amber-200 bg-[#C42B1C]/20 hover:bg-[#C42B1C]/30 border border-[#C42B1C]/40 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Пауза</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={() => onUpload && onUpload(match.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-bold text-emerald-200 bg-[#107C41]/20 hover:bg-[#107C41]/30 border border-[#107C41]/40 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Продолжить</span>
            </button>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={() => onRetry && onRetry(match.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-none text-xs font-bold text-rose-200 bg-[#C42B1C]/20 hover:bg-[#C42B1C]/30 border border-[#C42B1C]/40 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Повторить</span>
            </button>
          )}

          {(status === 'ready' || status === 'missing') && (
            <button
              type="button"
              onClick={() => onUpload && onUpload(match.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Загрузить</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
