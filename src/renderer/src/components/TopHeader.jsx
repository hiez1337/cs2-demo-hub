import React from 'react';
import { Zap, RefreshCw, Wifi } from 'lucide-react';

export default function TopHeader({
  title = 'CS2 Demo Hub',
  statusText = 'CSREP & FACEIT Онлайн',
  isOnline = true,
  isSyncing = false,
  pendingCount = 0,
  onSyncAll,
  onRefresh,
}) {
  return (
    <header className="h-16 w-full bg-[#161616] border-b border-white/10 px-6 flex items-center justify-between z-30 select-none">
      {/* Left: App Title and Sub-badge */}
      <div className="flex items-center gap-3.5">
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-black tracking-wider text-white uppercase flex items-center gap-2">
              <span>{title}</span>
            </h1>
            <span className="px-2 py-0.5 rounded-none text-[10px] font-mono font-bold tracking-wider uppercase bg-[#0078D4]/15 text-[#0078D4] border border-[#0078D4]/30">
              PRO SUITE
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-400 tracking-wide">
            Автоматическая загрузка демок FACEIT в облако CSREP.GG
          </span>
        </div>
      </div>

      {/* Middle / Right: Connection Status & Actions */}
      <div className="flex items-center gap-3">
        {/* Status Pill: CSREP & FACEIT Онлайн */}
        <div
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-none border text-xs font-medium transition-all ${
            isOnline
              ? 'bg-[#1c1c1c] border-emerald-500/40 text-emerald-300'
              : 'bg-[#1c1c1c] border-amber-500/40 text-amber-300'
          }`}
          title="Статус подключения к API"
        >
          <span
            className={`w-2 h-2 rounded-none ${
              isOnline ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span className="font-semibold tracking-wide flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            {statusText}
          </span>
        </div>

        {/* Refresh Icon Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isSyncing}
          className={`p-2 rounded-none border border-white/10 bg-[#2d2d2d] hover:bg-[#3a3a3a] text-slate-200 hover:text-white transition-colors cursor-pointer ${
            isSyncing ? 'cursor-not-allowed opacity-60' : ''
          }`}
          title="Проверить новые матчи"
        >
          <RefreshCw
            className={`w-4 h-4 text-slate-300 transition-transform ${
              isSyncing ? 'animate-spin text-[#0078D4]' : ''
            }`}
          />
        </button>

        {/* Primary Action Button: "⚡ Загрузить всё" */}
        <button
          type="button"
          onClick={onSyncAll}
          disabled={isSyncing || pendingCount === 0}
          className={`relative group flex items-center gap-2 px-4 py-2 rounded-none font-bold text-xs uppercase tracking-wider text-white transition-colors cursor-pointer ${
            isSyncing || pendingCount === 0
              ? 'bg-[#222222] text-slate-500 border border-white/5 cursor-not-allowed opacity-70'
              : 'bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] border border-transparent'
          }`}
        >
          <Zap className={`w-4 h-4 text-white ${isSyncing ? 'animate-pulse' : ''}`} />
          <span>
            {isSyncing
              ? 'Синхронизация...'
              : pendingCount > 0
              ? `⚡ Загрузить всё (${pendingCount})`
              : '⚡ Все демки загружены'}
          </span>
        </button>
      </div>
    </header>
  );
}

export { TopHeader, TopHeader as Titlebar };
