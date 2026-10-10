import React from 'react';
import { Zap, FolderArchive, BarChart3, Settings } from 'lucide-react';

export default function NavigationRail({
  activeTab = 'sync',
  onTabChange,
  userProfile = {
    nickname: 'Гость',
    isConnected: false,
    level: null,
    elo: null,
    isOnline: false,
  },
  onOpenAuth,
}) {
  const navItems = [
    { id: 'sync', label: 'Синхронизация', icon: Zap },
    { id: 'archive', label: 'Архив демок', icon: FolderArchive },
    { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <aside className="w-16 min-w-16 h-screen flex flex-col items-center justify-between py-3.5 bg-[#161616] border-r border-white/10 z-40 select-none relative">
      {/* Top Section: App / CS Logo */}
      <div className="flex flex-col items-center gap-6 w-full">
        <button
          type="button"
          onClick={() => onTabChange && onTabChange('sync')}
          className="group relative flex items-center justify-center w-11 h-11 rounded-none bg-[#1c1c1c] border border-white/10 hover:border-[#0078D4] transition-colors cursor-pointer"
          title="CS2 Demo Hub - Pro Suite"
        >
          <div className="w-full h-full bg-[#1c1c1c] rounded-none flex items-center justify-center relative overflow-hidden group-hover:bg-[#222222] transition-colors">
            <span className="font-mono font-black text-xs text-[#0078D4] tracking-wider">
              CS2
            </span>
          </div>
        </button>

        {/* Divider */}
        <div className="w-8 h-px bg-white/10" />

        {/* Navigation Items */}
        <nav className="flex flex-col items-center gap-1.5 w-full" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange && onTabChange(item.id)}
                className={`group relative flex items-center justify-center w-full h-11 rounded-none transition-colors cursor-pointer ${
                  isActive
                    ? 'border-l-2 border-[#0078D4] bg-[#222222] text-white'
                    : 'border-l-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#1c1c1c]'
                }`}
                title={item.label}
              >
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'text-[#0078D4]' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />

                {/* Tooltip on hover */}
                <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-none bg-[#1c1c1c] px-2.5 py-1 text-xs font-medium text-slate-200 opacity-0 border border-white/10 transition-opacity duration-150 group-hover:opacity-100">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: User Profile Avatar */}
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="w-8 h-px bg-white/10" />

        {(() => {
          const isConnected = Boolean(userProfile?.isConnected);
          const nickname = isConnected ? (userProfile?.nickname || 'Подключен') : 'Гость';
          const hasLevel = isConnected && Boolean(userProfile?.level);
          const hasElo = isConnected && Boolean(userProfile?.elo);
          const isOnline = isConnected && Boolean(userProfile?.isOnline);
          const initials = isConnected && userProfile?.nickname
            ? userProfile.nickname.slice(0, 2).toUpperCase()
            : '??';
          const tooltipTitle = isConnected
            ? `FACEIT Профиль: ${nickname}${hasElo ? ` (${userProfile.elo} ELO)` : ''}`
            : 'Профиль: Не подключен (Гость)';

          return (
            <button
              type="button"
              onClick={onOpenAuth}
              className="group relative flex items-center justify-center cursor-pointer p-1 rounded-none hover:bg-[#1c1c1c] transition-colors"
              title={tooltipTitle}
            >
              {/* Avatar frame */}
              <div className="relative w-11 h-11 rounded-none bg-[#1c1c1c] border border-white/10 group-hover:border-[#0078D4] transition-colors overflow-visible">
                {/* Inner background with initial */}
                <div className="w-full h-full bg-[#222222] rounded-none flex items-center justify-center font-bold text-slate-200 text-sm overflow-hidden relative">
                  <span className={isConnected ? 'text-[#0078D4] font-mono font-black' : 'text-slate-500 font-mono font-bold'}>
                    {initials}
                  </span>

                  {/* FACEIT level badge */}
                  {hasLevel && (
                    <div className="absolute bottom-0 right-0 bg-[#0078D4] text-white font-mono font-black text-[9px] px-1 py-0.2 rounded-none border-t border-l border-white/10">
                      {userProfile.level}
                    </div>
                  )}
                </div>

                {/* Online Status Indicator Dot */}
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-none border border-[#161616] ${
                    isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                />
              </div>

              {/* Hover popup tooltip */}
              <span className="pointer-events-none absolute left-14 z-50 whitespace-nowrap rounded-none bg-[#1c1c1c] px-2.5 py-1.5 text-xs font-medium text-slate-200 opacity-0 border border-white/10 transition-opacity duration-150 group-hover:opacity-100 flex flex-col gap-0.5">
                <span className="font-semibold text-white flex items-center gap-1">
                  <span>{nickname}</span>
                  {hasLevel ? (
                    <span className="text-[10px] bg-[#0078D4]/20 text-[#0078D4] px-1 rounded-none font-mono font-bold">
                      LVL {userProfile.level}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-[#222222] text-slate-400 px-1.5 py-0.5 rounded-none font-mono">
                      {isConnected ? 'Подключен' : 'Не подключен'}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {isConnected
                    ? `${hasElo ? `${userProfile.elo} ELO · ` : ''}Нажмите для аккаунта`
                    : 'Нажмите для входа'}
                </span>
              </span>
            </button>
          );
        })()}
      </div>
    </aside>
  );
}
