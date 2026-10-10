import React from 'react';
import { Layers, Clock, CheckCircle2, Activity } from 'lucide-react';

export default function MetricsStrip({
  stats = {
    total: 0,
    missing: 0,
    uploaded: 0,
    speedMBs: 0,
    activeWorkers: 4,
    isStreaming: false,
  },
}) {
  const {
    total = 0,
    missing = 0,
    uploaded = 0,
    speedMBs = 0,
    activeWorkers = 4,
    isStreaming = false,
    stage = 'uploading',
  } = stats;

  const statItems = [
    {
      id: 'total',
      label: 'Всего матчей',
      value: total,
      subtext: 'Сыграно на FACEIT',
      icon: Layers,
      color: 'text-slate-300',
    },
    {
      id: 'missing',
      label: 'Требуют загрузки',
      value: missing,
      subtext: missing > 0 ? 'Ожидают очереди' : 'Очередь чиста',
      icon: Clock,
      color: missing > 0 ? 'text-amber-400' : 'text-slate-400',
      badge: missing > 0 ? `${missing} новых` : null,
    },
    {
      id: 'uploaded',
      label: 'Синхронизировано',
      value: uploaded,
      subtext: total > 0 ? `${Math.round((uploaded / total) * 100)}% от общего числа` : '0%',
      icon: CheckCircle2,
      color: 'text-[#107C41]',
    },
  ];

  return (
    <section className="w-full px-6 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5 select-none bg-[#121212]">
      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
        {statItems.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className="relative rounded-none bg-[#1c1c1c] border border-white/10 p-3.5 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {item.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-white font-mono tracking-tight">
                      {item.value}
                    </span>
                    {item.badge && (
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-none bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                    {item.subtext}
                  </p>
                </div>

                <div className="p-2 rounded-none bg-[#222222] border border-white/10">
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Stream Telemetry Card */}
      <div className="md:w-72 flex flex-col justify-center">
        <div
          className={`relative rounded-none border p-3.5 transition-colors ${
            isStreaming || speedMBs > 0
              ? stage === 'downloading'
                ? 'bg-[#1c1c1c] border-[#0078D4]/60'
                : 'bg-[#1c1c1c] border-[#107C41]/60'
              : 'bg-[#1c1c1c] border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-none ${
                  isStreaming || speedMBs > 0
                    ? stage === 'downloading'
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-emerald-500 animate-pulse'
                    : 'bg-slate-600'
                }`}
              />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isStreaming || speedMBs > 0
                  ? stage === 'downloading'
                    ? 'Входящий FACEIT'
                    : 'Исходящий CSREP R2'
                  : 'Телеметрия сети'}
              </span>
            </div>

            <span className="text-[10px] font-mono font-bold text-slate-300 bg-[#222222] px-1.5 py-0.5 rounded-none border border-white/10">
              {isStreaming || speedMBs > 0 ? `${activeWorkers} ПОТОКОВ` : 'ГОТОВ'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-xl font-black font-mono tracking-tight ${
                  isStreaming || speedMBs > 0
                    ? stage === 'downloading'
                      ? 'text-cyan-400'
                      : 'text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                {stage === 'downloading' ? '↓' : '▲'} {Number(speedMBs || 0).toFixed(1)} МБ/с
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <Activity
                className={`w-3.5 h-3.5 ${
                  isStreaming || speedMBs > 0
                    ? stage === 'downloading'
                      ? 'text-cyan-400 animate-pulse'
                      : 'text-emerald-400 animate-pulse'
                    : 'text-slate-500'
                }`}
              />
              <span>
                {isStreaming || speedMBs > 0
                  ? stage === 'downloading'
                    ? 'Скачивание демо'
                    : 'Передача чанков'
                  : 'Канал свободен'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
