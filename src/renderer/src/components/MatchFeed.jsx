import React, { useState, useMemo } from 'react';
import MatchCard from './MatchCard.jsx';
import EmptyState from './EmptyState.jsx';
import { Search, CheckCircle2, Clock, Layers, AlertCircle } from 'lucide-react';

export default function MatchFeed({
  matches = [],
  onUploadMatch,
  onPauseMatch,
  onOpenDetails,
  onRetryMatch,
  onRefresh,
  onOpenAuth,
  auth,
  isSyncing = false,
}) {
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'missing' | 'uploaded' | 'failed'
  const [selectedMap, setSelectedMap] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Map filters list
  const availableMaps = [
    { id: 'all', label: 'Все карты' },
    { id: 'de_dust2', label: 'Dust II' },
    { id: 'de_ancient', label: 'Ancient' },
    { id: 'de_mirage', label: 'Mirage' },
    { id: 'de_inferno', label: 'Inferno' },
    { id: 'de_nuke', label: 'Nuke' },
    { id: 'de_anubis', label: 'Anubis' },
  ];

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: matches.length,
      missing: matches.filter(
        (m) => m.status === 'missing' || m.status === 'ready' || m.status === 'uploading' || m.status === 'paused'
      ).length,
      uploaded: matches.filter((m) => m.status === 'uploaded').length,
      failed: matches.filter((m) => m.status === 'failed').length,
    };
  }, [matches]);

  // Filtered matches
  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      // 1. Status filter
      if (activeFilter === 'missing') {
        const isMiss =
          match.status === 'missing' ||
          match.status === 'ready' ||
          match.status === 'uploading' ||
          match.status === 'paused';
        if (!isMiss) return false;
      } else if (activeFilter === 'uploaded') {
        if (match.status !== 'uploaded') return false;
      } else if (activeFilter === 'failed') {
        if (match.status !== 'failed') return false;
      }

      // 2. Map filter
      if (selectedMap !== 'all') {
        const mapKey = (match.map || '').toLowerCase().trim();
        if (mapKey !== selectedMap) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const mapName = (match.map || '').toLowerCase();
        const matchId = String(match.id || match.faceit_id || '').toLowerCase();
        if (!mapName.includes(query) && !matchId.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [matches, activeFilter, selectedMap, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-[#121212]">
      {/* Feed Filter & Search Bar */}
      <div className="px-6 py-2.5 border-b border-white/10 bg-[#161616] flex flex-col gap-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer border ${
                activeFilter === 'all'
                  ? 'bg-[#0078D4] border-[#0078D4] text-white'
                  : 'bg-[#1c1c1c] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-[#222222]'
              }`}
            >
              Все ({counts.all})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('missing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer border ${
                activeFilter === 'missing'
                  ? 'bg-[#0078D4] border-[#0078D4] text-white'
                  : 'bg-[#1c1c1c] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-[#222222]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>К загрузке ({counts.missing})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('uploaded')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer border ${
                activeFilter === 'uploaded'
                  ? 'bg-[#0078D4] border-[#0078D4] text-white'
                  : 'bg-[#1c1c1c] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-[#222222]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Загружено ({counts.uploaded})</span>
            </button>

            {counts.failed > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter('failed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-bold transition-colors cursor-pointer border ${
                  activeFilter === 'failed'
                    ? 'bg-[#C42B1C] border-[#C42B1C] text-white'
                    : 'bg-[#1c1c1c] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-[#222222]'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Ошибки ({counts.failed})</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по карте / ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#1c1c1c] border border-white/10 rounded-none text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#0078D4] w-44 md:w-56 transition-colors"
            />
          </div>
        </div>

        {/* Map Filter Tabs with rigid 2px bottom underline */}
        <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-white/5" aria-label="Map Filters">
          {availableMaps.map((map) => {
            const isMapActive = selectedMap === map.id;
            return (
              <button
                key={map.id}
                type="button"
                onClick={() => setSelectedMap(map.id)}
                className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer rounded-none whitespace-nowrap ${
                  isMapActive
                    ? 'border-b-2 border-[#0078D4] text-white bg-[#222222]'
                    : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#1c1c1c]'
                }`}
              >
                {map.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Matches Grid / Scrollable area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {matches.length === 0 ? (
          <EmptyState
            onScan={onRefresh}
            onOpenAuth={onOpenAuth}
            isSyncing={isSyncing}
            auth={auth}
          />
        ) : filteredMatches.length === 0 ? (
          /* Filter Empty State */
          <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4">
            <div className="w-16 h-16 rounded-none bg-[#1c1c1c] border border-white/10 flex items-center justify-center mb-4 text-slate-400">
              <Layers className="w-8 h-8 text-[#0078D4]" />
            </div>
            <h4 className="text-base font-bold text-white mb-1">
              Нет матчей под этот фильтр
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              Попробуйте сбросить фильтры или изменить поисковый запрос.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMatches.map((match) => (
              <MatchCard
                key={match.id || match.faceit_id}
                match={match}
                onUpload={onUploadMatch}
                onPause={onPauseMatch}
                onOpenDetails={onOpenDetails}
                onRetry={onRetryMatch}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
