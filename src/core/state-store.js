import EventEmitter from 'events';
import { parseMatchScore, formatMatchDate } from '../domain/match-parser.js';

export class AppStateStore extends EventEmitter {
  constructor(config, historyStore) {
    super();
    this.config = config;
    this.historyStore = historyStore;

    this.state = {
      status: 'idle',
      isRunning: false,
      currentMatch: null,
      matches: [],
      stats: { total: 0, uploaded: 0, skipped: 0, failed: 0 },
      progress: {
        filePercent: 0,
        currentFile: '',
        speedInfo: '',
        chunksCompleted: 0,
        chunksTotal: 0,
      },
      logs: [],
    };
  }

  getSnapshot() {
    return {
      ...this.state,
      config: {
        steamId: this.config.steamId,
        faceitConfigured: Boolean(this.config.faceitApiKey),
        maxPages: this.config.maxPages,
        chunkConcurrency: this.config.chunkConcurrency,
      },
    };
  }

  log(message, type = 'info') {
    const entry = {
      timestamp: new Date().toLocaleTimeString('ru-RU'),
      type,
      message,
    };
    this.state.logs.push(entry);
    if (this.state.logs.length > 150) this.state.logs.shift();
    this.emit('log', entry);
  }

  setStatus(status) {
    this.state.status = status;
    this.state.isRunning = status !== 'idle' && status !== 'done' && status !== 'stopped' && status !== 'error';
    this.emit('state', { status: this.state.status, isRunning: this.state.isRunning });
  }

  setMatches(matches) {
    this.state.matches = matches.map(m => {
      const scoreObj = parseMatchScore(m.score);
      const isAlreadyUploaded = this.historyStore.has(m.csrepMatchId);
      return {
        ...m,
        scoreParsed: scoreObj.scoreStr,
        isWin: scoreObj.isWin,
        dateFormatted: formatMatchDate(m.date),
        statusClass: isAlreadyUploaded ? 'done' : (m.statusClass || 'pending'),
        statusText: isAlreadyUploaded ? 'Загружено ✓' : (m.statusText || 'Ожидание'),
      };
    });
    this.state.stats.total = this.state.matches.length;
    this.emit('matches_found', { matches: this.state.matches });
    this.emit('stats', { stats: this.state.stats });
  }

  updateMatchStatus(csrepMatchId, statusClass, statusText) {
    const match = this.state.matches.find(m => (m.csrepMatchId === csrepMatchId || m.id === csrepMatchId));
    if (match) {
      match.statusClass = statusClass;
      match.statusText = statusText;
    }
    const normalizedStatus = statusClass === 'done' ? 'uploaded' : (statusClass === 'active' ? 'uploading' : statusClass);
    this.emit('matchUpdated', {
      id: csrepMatchId,
      csrepMatchId,
      statusClass,
      statusText,
      status: normalizedStatus,
      error: statusText,
      error_message: statusText,
    });
    this.emit('matches_found', { matches: this.state.matches });
  }

  updateProgress(progressData) {
    this.state.progress = { ...this.state.progress, ...progressData };
    this.emit('progress', {
      ...progressData,
      progress: this.state.progress,
    });
  }
}
