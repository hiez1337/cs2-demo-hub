import React from 'react';
import { Layers, RefreshCw, KeyRound } from 'lucide-react';

export default function EmptyState({
  onScan,
  onOpenAuth,
  isSyncing = false,
  auth = null,
}) {
  const isFaceitConnected = Boolean(auth?.faceit?.isConnected);
  const isSteamConnected = Boolean(auth?.steam?.isConnected);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none bg-[#121212]">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-none bg-[#1c1c1c] border border-white/10 flex items-center justify-center">
          <Layers className="w-10 h-10 text-[#0078D4]" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-1.5 rounded-none bg-[#0078D4] text-white border border-white/10">
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      <h3 className="text-xl font-black text-white mb-2">
        Матчи не найдены
      </h3>

      <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
        Войдите в аккаунты и нажмите «Сканировать FACEIT», чтобы автоматически загрузить последние матчи и начать синхронизацию демок.
      </p>

      {/* Account connection status cards */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-none bg-[#1c1c1c] border border-white/10 text-xs">
          <span
            className={`w-2 h-2 rounded-none ${
              isSteamConnected ? 'bg-emerald-400' : 'bg-slate-600'
            }`}
          />
          <span className="text-slate-400">Steam:</span>
          <span
            className={`font-semibold ${
              isSteamConnected ? 'text-emerald-400 font-mono' : 'text-slate-500'
            }`}
          >
            {isSteamConnected ? (auth?.steam?.steamId || 'Подключен') : 'Не подключен'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-none bg-[#1c1c1c] border border-white/10 text-xs">
          <span
            className={`w-2 h-2 rounded-none ${
              isFaceitConnected ? 'bg-[#0078D4]' : 'bg-slate-600'
            }`}
          />
          <span className="text-slate-400">FACEIT:</span>
          <span
            className={`font-semibold ${
              isFaceitConnected ? 'text-[#0078D4]' : 'text-slate-500'
            }`}
          >
            {isFaceitConnected ? (auth?.faceit?.nickname || 'Подключен') : 'Не подключен'}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onScan}
          disabled={isSyncing}
          className="flex items-center gap-2 px-6 py-2.5 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Сканирование...' : 'Сканировать FACEIT'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenAuth}
          className="flex items-center gap-2 px-5 py-2.5 rounded-none text-xs font-bold text-slate-200 bg-[#2d2d2d] hover:bg-[#3a3a3a] border border-white/10 transition-colors cursor-pointer"
        >
          <KeyRound className="w-4 h-4 text-[#0078D4]" />
          <span>Войти в аккаунты</span>
        </button>
      </div>
    </div>
  );
}
