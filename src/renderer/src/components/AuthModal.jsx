import React, { useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  User,
  Lock,
} from 'lucide-react';

export default function AuthModal({
  isOpen = false,
  onClose,
  auth = {
    steam: {
      isConnected: false,
      steamId: '',
    },
    faceit: {
      isConnected: false,
      nickname: 'Гость',
    },
    dpapiProtected: false,
  },
  onLoginSteam,
  onLoginFaceit,
  onLogoutSteam,
  onLogoutFaceit,
}) {
  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose && onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none"
      onClick={onClose}
    >
      {/* Modal Card */}
      <div
        className="relative w-full max-w-lg rounded-none bg-[#1c1c1c] border border-white/10 p-6 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rigid Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#0078D4]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-none bg-[#222222] border border-white/10 text-[#0078D4]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Управление аккаунтами
              </h2>
              <p className="text-xs text-slate-400">
                Авторизация Steam, FACEIT и безопасные токены DPAPI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none text-slate-400 hover:text-white hover:bg-[#2d2d2d] transition-colors cursor-pointer"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-3.5">
          {/* Steam Connection Card */}
          <div className="p-4 rounded-none bg-[#161616] border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-[#222222] border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                  {auth?.steam?.isConnected ? (
                    <span className="text-[#0078D4] font-mono font-black">ST</span>
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Steam аккаунт</h3>
                    {auth?.steam?.isConnected ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-2 py-0.5 rounded-none">
                        <CheckCircle2 className="w-3 h-3" />
                        Подключено
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold font-mono text-slate-400 bg-[#222222] border border-white/10 px-2 py-0.5 rounded-none">
                        Не подключен
                      </span>
                    )}
                  </div>

                  {auth?.steam?.isConnected ? (
                    <div className="mt-1 text-xs text-slate-400 font-mono">
                      <span>{auth?.steam?.personaName || 'Steam подключен'}</span>
                      {auth?.steam?.steamId ? (
                        <>
                          <span className="text-slate-600 mx-1.5">•</span>
                          <span className="text-slate-400 text-[11px]">{auth.steam.steamId}</span>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      Необходим для получения демок и авторизации в CSREP.GG
                    </p>
                  )}
                </div>
              </div>

              {/* Steam Action Button */}
              {auth?.steam?.isConnected ? (
                <button
                  type="button"
                  onClick={onLogoutSteam}
                  className="px-3 py-1.5 rounded-none text-xs font-semibold text-rose-300 bg-[#C42B1C]/20 hover:bg-[#C42B1C]/30 border border-[#C42B1C]/40 transition-colors cursor-pointer"
                >
                  Выйти
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLoginSteam}
                  className="px-3.5 py-1.5 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer"
                >
                  Войти через Steam
                </button>
              )}
            </div>
          </div>

          {/* FACEIT Connection Card */}
          <div className="p-4 rounded-none bg-[#161616] border border-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-[#222222] border border-white/10 flex items-center justify-center font-black font-mono text-[#0078D4] text-sm">
                  {auth?.faceit?.isConnected ? (
                    auth?.faceit?.level ? (
                      auth.faceit.level
                    ) : (
                      'FI'
                    )
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">FACEIT аккаунт</h3>
                    {auth?.faceit?.isConnected ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-2 py-0.5 rounded-none">
                        <CheckCircle2 className="w-3 h-3" />
                        Синхронизирован
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold font-mono text-slate-400 bg-[#222222] border border-white/10 px-2 py-0.5 rounded-none">
                        Не подключен
                      </span>
                    )}
                  </div>

                  {auth?.faceit?.isConnected ? (
                    <div className="mt-1 text-xs text-slate-400 font-mono">
                      <span className="text-white font-semibold">
                        {auth?.faceit?.nickname || 'Подключен'}
                      </span>
                      {auth?.faceit?.elo ? (
                        <>
                          <span className="text-slate-600 mx-1.5">•</span>
                          <span className="text-[#0078D4] font-bold">{auth.faceit.elo} ELO</span>
                        </>
                      ) : null}
                      {auth?.faceit?.level ? (
                        <>
                          <span className="text-slate-600 mx-1.5">•</span>
                          <span className="text-slate-400">LVL {auth.faceit.level}</span>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      Используется для парсинга истории матчей и скачивания демок
                    </p>
                  )}
                </div>
              </div>

              {/* FACEIT Action Button */}
              {auth?.faceit?.isConnected ? (
                <button
                  type="button"
                  onClick={onLogoutFaceit}
                  className="px-3 py-1.5 rounded-none text-xs font-semibold text-rose-300 bg-[#C42B1C]/20 hover:bg-[#C42B1C]/30 border border-[#C42B1C]/40 transition-colors cursor-pointer"
                >
                  Выйти
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLoginFaceit}
                  className="px-3.5 py-1.5 rounded-none text-xs font-bold text-white bg-[#0078D4] hover:bg-[#1084D9] active:bg-[#006CBE] transition-colors cursor-pointer"
                >
                  Войти через FACEIT
                </button>
              )}
            </div>
          </div>

          {/* CSREP & Encryption DPAPI Card */}
          <div className="p-4 rounded-none bg-[#161616] border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  CSREP Токен & Windows DPAPI
                </h4>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-none border ${
                  auth?.dpapiProtected
                    ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30'
                    : 'text-slate-400 bg-[#222222] border-white/10'
                }`}
              >
                {auth?.dpapiProtected ? 'safeStorage активен' : 'safeStorage выключен'}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Все сессионные куки и токены авторизации шифруются аппаратно на вашем ПК с помощью Windows Data Protection API (DPAPI). Открытый доступ к паролям исключён.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-none text-xs font-bold text-slate-200 bg-[#2d2d2d] hover:bg-[#3a3a3a] border border-white/10 transition-colors cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
