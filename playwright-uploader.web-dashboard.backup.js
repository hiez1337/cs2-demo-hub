import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { exec } from 'child_process';

// ═════════════════════════════════════════════════════════════════════════════
// 1. ЦЕНТРАЛЬНОЕ ХРАНИЛИЩЕ СОСТОЯНИЯ (STATE STORE & EVENT BUS)
// ═════════════════════════════════════════════════════════════════════════════
class AppStateManager extends EventEmitter {
  constructor() {
    super();
    this.configPath = path.resolve('./config.json');
    this.historyFile = path.resolve('./uploaded_history.json');

    this.state = {
      status: 'idle', // 'idle' | 'scanning' | 'uploading' | 'stopped'
      config: {
        steamId: '76561198434644264',
        faceitApiKey: '97898eb5-657f-4d91-9c29-eaa74954bf58',
        maxPages: 3,
        chunkConcurrency: 4,
        webPort: 3333,
        watchIntervalMinutes: 10,
      },
      matches: [],
      activeMatchId: null,
      currentProgress: {
        overallPercent: 0,
        filePercent: 0,
        matchTitle: '—',
        speedInfo: '—',
        activeMatchId: null,
        matchStatus: '',
        matchStatusClass: '',
      },
      stats: {
        total: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        trafficMb: 0,
      },
      logs: [], // Хранилище последних 150 записей логов (кольцевой буфер)
    };

    this.loadConfig();
    this.loadHistory();
  }

  loadConfig() {
    if (fs.existsSync(this.configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.state.config = { ...this.state.config, ...parsed };
      } catch (e) {
        console.error('Ошибка чтения config.json:', e.message);
      }
    }
  }

  loadHistory() {
    this.uploadedHistory = new Set();
    if (fs.existsSync(this.historyFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        if (Array.isArray(raw)) this.uploadedHistory = new Set(raw);
      } catch {}
    }
  }

  saveHistory(matchId) {
    this.uploadedHistory.add(matchId);
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify([...this.uploadedHistory], null, 2), 'utf8');
    } catch {}
  }

  log(message, level = 'info') {
    const time = new Date().toLocaleTimeString('ru-RU');
    const entry = { message, level, time };

    this.state.logs.push(entry);
    if (this.state.logs.length > 150) this.state.logs.shift();

    this.emit('log', entry);
  }

  setStatus(status) {
    this.state.status = status;
    this.emit('state', { status, isRunning: status === 'uploading' || status === 'scanning' });
  }

  setMatches(matches) {
    this.state.matches = matches;
    this.state.stats.total = matches.length;
    this.emit('matches_found', { matches });
    this.emit('stats', { stats: this.state.stats });
  }

  updateProgress(patch) {
    this.state.currentProgress = { ...this.state.currentProgress, ...patch };
    this.emit('progress', this.state.currentProgress);
  }

  updateStats(patch) {
    this.state.stats = { ...this.state.stats, ...patch };
    this.emit('stats', { stats: this.state.stats });
  }

  getSnapshot() {
    return {
      status: this.state.status,
      config: this.state.config,
      matches: this.state.matches,
      stats: this.state.stats,
      currentProgress: this.state.currentProgress,
      logs: this.state.logs,
    };
  }
}

const stateManager = new AppStateManager();

// ═════════════════════════════════════════════════════════════════════════════
// 2. ДВИЖОК АВТОМАТИЗАЦИИ И ЗАГРУЗКИ (UPLOADER ENGINE)
// ═════════════════════════════════════════════════════════════════════════════
class UploaderEngine {
  constructor(stateMgr) {
    this.mgr = stateMgr;
    this.context = null;
    this.currentAbortController = null;
    this.userDataDir = path.resolve('./.browser_session');
    this.tempDownloadsDir = path.resolve('./demos_temp');

    if (!fs.existsSync(this.userDataDir)) fs.mkdirSync(this.userDataDir, { recursive: true });
    if (!fs.existsSync(this.tempDownloadsDir)) fs.mkdirSync(this.tempDownloadsDir, { recursive: true });
  }

  async getBrowserContext(headless = false) {
    if (this.context) return this.context;

    this.mgr.log('Инициализирую сессию браузера Playwright...');
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: headless ? true : false,
      viewport: { width: 1366, height: 860 },
      downloadsPath: this.tempDownloadsDir,
      acceptDownloads: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    // Загрузка кук
    const cookiesFile = path.resolve('./cookies.json');
    if (fs.existsSync(cookiesFile)) {
      try {
        const rawCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
        const validCookies = [];
        for (const c of rawCookies) {
          if (!c.name || typeof c.value === 'undefined') continue;
          const isFaceit = (c.domain && c.domain.includes('faceit')) || (c.url && c.url.includes('faceit'));
          const cookieObj = {
            name: String(c.name).trim(),
            value: String(c.value).trim(),
            path: c.path || '/',
          };
          if (c.name.startsWith('__Host-')) {
            cookieObj.url = isFaceit ? 'https://www.faceit.com' : 'https://csrep.gg';
            cookieObj.secure = true;
          } else if (c.name.startsWith('__Secure-')) {
            cookieObj.domain = isFaceit ? '.faceit.com' : '.csrep.gg';
            cookieObj.secure = true;
          } else {
            cookieObj.domain = isFaceit ? '.faceit.com' : '.csrep.gg';
          }
          validCookies.push(cookieObj);
        }
        await this.context.addCookies(validCookies).catch(() => {});
      } catch {}
    }

    return this.context;
  }

  async close() {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }

  async saveCookies() {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies(['https://csrep.gg', 'https://www.faceit.com']);
      if (cookies && cookies.length > 0) {
        fs.writeFileSync(path.resolve('./cookies.json'), JSON.stringify(cookies, null, 2), 'utf8');
      }
    } catch {}
  }

  async scan(pages = null) {
    const pagesToScan = pages || this.mgr.state.config.maxPages || 1;
    this.mgr.setStatus('scanning');
    this.mgr.log(`Сканирование csrep.gg (${pagesToScan} стр)...`);

    try {
      const context = await this.getBrowserContext();
      const pageCsrep = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      await pageCsrep.goto(`https://csrep.gg/player/${this.mgr.state.config.steamId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pageCsrep.waitForTimeout(4000);
      await this.saveCookies();

      const missing = await pageCsrep.evaluate(async ({ steamId, maxPages }) => {
        function generateCsrepHeaders() {
          const reqId = crypto.randomUUID();
          const timestamp = Date.now().toString();
          const str = `${reqId}${timestamp}`;
          let hash = 0;
          for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
          return {
            'Accept': 'application/json, text/plain, */*',
            'X-Request-ID': reqId,
            'X-Request-Timestamp': timestamp,
            'X-Request-Secret': (hash >>> 0).toString(36),
          };
        }

        const resultList = [];
        for (let page = 1; page <= maxPages; page++) {
          try {
            const res = await fetch(
              `/api/players/${steamId}/matches?page=${page}&limit=20&sort%5Bkey%5D=date&sort%5Bdirection%5D=desc`,
              { headers: generateCsrepHeaders(), credentials: 'include' }
            );
            if (!res.ok) break;
            const data = await res.json();
            if (!data.result || data.result.length === 0) break;

            for (const match of data.result) {
              if (match.status === 'DEMO_MISSING' && match.source === 'FACEIT' && match.source_id) {
                resultList.push({
                  csrepMatchId: match.id,
                  faceitMatchId: match.source_id,
                  map: match.map,
                  date: match.date,
                  score: match.score,
                });
              }
            }
            if (!data.pagination || !data.pagination.hasNextPage) break;
          } catch {
            break;
          }
        }
        return resultList;
      }, { steamId: this.mgr.state.config.steamId, maxPages: pagesToScan });

      this.mgr.setMatches(missing);
      this.mgr.log(`Найдено матчей без демок: ${missing.length}`, missing.length > 0 ? 'info' : 'success');
      this.mgr.setStatus('idle');
      return missing;
    } catch (err) {
      this.mgr.log(`Ошибка сканирования: ${err.message}`, 'error');
      this.mgr.setStatus('idle');
      return [];
    }
  }

  async downloadFaceitDemo(match, pageFaceit, signal) {
    if (signal && signal.aborted) return null;
    try {
      const resFaceitApi = await fetch(`https://open.faceit.com/data/v4/matches/${match.faceitMatchId}`, {
        headers: { 'Authorization': `Bearer ${this.mgr.state.config.faceitApiKey}` },
        signal,
      });
      if (!resFaceitApi.ok) {
        this.mgr.log(`[FACEIT API] Ошибка получения матча: HTTP ${resFaceitApi.status}`, 'warn');
        return null;
      }

      const faceitData = await resFaceitApi.json();
      if (!faceitData.demo_url || faceitData.demo_url.length === 0) {
        this.mgr.log(`[FACEIT API] Поле demo_url пустое (срок хранения 30 дней истёк)`, 'warn');
        return null;
      }
      const rawUrl = Array.isArray(faceitData.demo_url) ? faceitData.demo_url[0] : faceitData.demo_url;

      // 1. Запрос подписанной ссылки через контекст страницы FACEIT
      let signedUrlResult = await pageFaceit.evaluate(async (url) => {
        try {
          const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'faceit-referer': 'web-next',
            },
            body: JSON.stringify({ resource_url: url }),
          });
          const json = await res.json();
          return { ok: res.ok, status: res.status, url: json.payload ? json.payload.download_url : null, json };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, rawUrl);

      const signedUrl = signedUrlResult && signedUrlResult.url;

      if (signedUrl) {
        const demoRes = await fetch(signedUrl, { signal });
        if (demoRes.ok) {
          const arrayBuf = await demoRes.arrayBuffer();
          return Buffer.from(arrayBuf);
        }
      }

      // 2. Фолбек: открытие комнаты матча и клик по кнопке "Смотреть демо"
      this.mgr.log(`[FACEIT] Пробую скачать через комнату матча: ${match.faceitMatchId}...`, 'info');
      const roomUrl = `https://www.faceit.com/ru/cs2/room/${match.faceitMatchId}`;
      await pageFaceit.goto(roomUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pageFaceit.waitForTimeout(2500);

      const btnSelector = 'button:has-text("Смотреть демо"), button:has-text("Watch demo"), button:has-text("Скачать демо"), button:has-text("Download demo")';
      const demoBtn = await pageFaceit.$(btnSelector);

      if (demoBtn) {
        const [download] = await Promise.all([
          pageFaceit.waitForEvent('download', { timeout: 20000 }).catch(() => null),
          demoBtn.click(),
        ]);

        if (download) {
          const downloadFilename = `${match.faceitMatchId}-1-1.dem.zst`;
          const filePath = path.join(this.tempDownloadsDir, downloadFilename);
          await download.saveAs(filePath);
          const fileBuffer = fs.readFileSync(filePath);
          try { fs.unlinkSync(filePath); } catch {}
          return fileBuffer;
        }
      } else {
        this.mgr.log(`[FACEIT] Кнопка скачивания демо не найдена на странице комнаты.`, 'warn');
      }
    } catch (e) {
      if (signal && signal.aborted) return null;
      this.mgr.log(`[FACEIT] Ошибка скачивания демки: ${e.message}`, 'error');
    }
    return null;
  }

  async uploadMatches(matchList) {
    if (this.mgr.state.status === 'uploading') return;
    this.mgr.setStatus('uploading');

    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const context = await this.getBrowserContext();
    const pageCsrep = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const pageFaceit = await context.newPage();

    await pageFaceit.goto('https://www.faceit.com/ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pageFaceit.waitForTimeout(2000);

    let successCount = this.mgr.state.stats.uploaded;
    let skippedCount = this.mgr.state.stats.skipped;
    let failedCount = this.mgr.state.stats.failed;
    let totalTraffic = this.mgr.state.stats.trafficMb;

    let nextDownloadPromise = this.downloadFaceitDemo(matchList[0], pageFaceit, signal);

    const mapEmojis = {
      de_mirage: '🏛️  DE_MIRAGE',
      de_dust2: '🏜️  DE_DUST2',
      de_ancient: '🌿  DE_ANCIENT',
      de_anubis: '🏺  DE_ANUBIS',
      de_inferno: '🔔  DE_INFERNO',
      de_nuke: '☢️  DE_NUKE',
      de_vertigo: '🏢  DE_VERTIGO',
      de_cache: '🏭  DE_CACHE',
      de_train: '🚂  DE_TRAIN',
      de_overpass: '🌉  DE_OVERPASS',
    };

    function parseMatchScore(score) {
      if (!score) return { scoreStr: '—', isWin: false };
      let str = '';
      let part1 = 0, part2 = 0;

      if (typeof score === 'string') {
        str = score;
        const parts = score.replace('-', ':').split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          part1 = parts[0];
          part2 = parts[1];
        }
      } else if (Array.isArray(score)) {
        part1 = Number(score[0]) || 0;
        part2 = Number(score[1]) || 0;
        str = `${part1}:${part2}`;
      } else if (typeof score === 'object') {
        const vals = Object.values(score).map(Number).filter(n => !isNaN(n));
        if (vals.length >= 2) {
          part1 = vals[0];
          part2 = vals[1];
          str = `${part1}:${part2}`;
        } else {
          str = JSON.stringify(score);
        }
      } else {
        str = String(score);
      }

      return { scoreStr: str || '—', isWin: part1 > part2 };
    }

    for (let i = 0; i < matchList.length; i++) {
      if (signal.aborted) {
        this.mgr.log('⚠️ Процесс загрузки остановлен пользователем.', 'warn');
        break;
      }

      const match = matchList[i];
      const mapTitle = mapEmojis[match.map] || `🎯  ${String(match.map || 'UNKNOWN').toUpperCase()}`;
      const { scoreStr, isWin } = parseMatchScore(match.score);
      const resultText = isWin ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
      const dateFormatted = new Date(match.date).toLocaleString('ru-RU');

      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log(`│ 🎮 МАТЧ [${i + 1}/${matchList.length}]  •  ${mapTitle.padEnd(58)}│`);
      console.log(`│ 🏆 Результат: ${scoreStr.padEnd(7)} (${resultText})    📅 Дата: ${dateFormatted.padEnd(28)}│`);
      console.log(`│ 🆔 FACEIT: ${(match.faceitMatchId || '').padEnd(64)}│`);
      console.log(`│ 🔗 CSRep:  ${(match.csrepMatchId || '').padEnd(64)}│`);
      console.log('└─────────────────────────────────────────────────────────────────────────────┘');

      this.mgr.updateProgress({
        activeMatchId: match.csrepMatchId,
        matchTitle: `${match.map} (${scoreStr})`,
        matchStatus: 'Скачивание с FACEIT...',
        matchStatusClass: 'uploading',
        overallPercent: Math.round((i / matchList.length) * 100),
        filePercent: 0,
      });

      this.updateMatchRowStatus(match.csrepMatchId, 'uploading', 'Скачивание...');

      try {
        this.mgr.log(`[1/3] Запрос подписанного URL с FACEIT CDN...`);
        const fileBuffer = await nextDownloadPromise;

        if (i + 1 < matchList.length && !signal.aborted) {
          nextDownloadPromise = this.downloadFaceitDemo(matchList[i + 1], pageFaceit, signal);
        }

        if (!fileBuffer || fileBuffer.length === 0) {
          this.mgr.log('⚠️ [ПРОПУСК] Демо недоступно на FACEIT (срок хранения 30 дней истёк)', 'warn');
          skippedCount++;
          this.mgr.updateStats({ skipped: skippedCount });
          this.updateMatchRowStatus(match.csrepMatchId, 'skipped', 'Срок истёк');
          continue;
        }

        const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);
        this.mgr.log(`[1/3] Файл успешно получен: ${sizeMb} MB ✓`, 'success');

        const uploadFilename = `${match.faceitMatchId}-1-1.dem.zst`;

        // Инициализация загрузки на csrep.gg
        this.mgr.log(`[2/3] Инициализация multipart-загрузки на csrep.gg...`);
        const initData = await pageCsrep.evaluate(async ({ filename, size }) => {
          function generateCsrepHeaders() {
            const reqId = crypto.randomUUID();
            const timestamp = Date.now().toString();
            const str = `${reqId}${timestamp}`;
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
            return {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': (hash >>> 0).toString(36),
              'Content-Type': 'application/json',
            };
          }

          try {
            const res = await fetch('/api/uploads/demos', {
              method: 'POST',
              credentials: 'include',
              headers: generateCsrepHeaders(),
              body: JSON.stringify({ filename, size }),
            });
            return await res.json();
          } catch (e) {
            return { ok: false, error: e.message };
          }
        }, { filename: uploadFilename, size: fileBuffer.length });

        const token = initData.result && initData.result.token;
        const fileId = initData.result && initData.result.file ? initData.result.file.id : null;

        if (!token) {
          throw new Error(`Ошибка инициализации загрузки на csrep.gg: ${initData.error || 'нет токена'}`);
        }

        const partSize = 10 * 1024 * 1024; // 10MB
        const partCount = Math.ceil(fileBuffer.length / partSize);
        const concurrency = this.mgr.state.config.chunkConcurrency || 4;

        this.mgr.log(`[2/3] Отправка в Cloudflare R2 (${partCount} частей, ${concurrency}x параллельно)...`);

        const partIndices = Array.from({ length: partCount }, (_, idx) => idx + 1);
        let completedChunks = 0;
        const startTime = Date.now();

        // Параллельная загрузка частей с ретраем и AbortSignal
        await this.pMap(partIndices, async (p) => {
          if (signal.aborted) throw new Error('Загрузка отменена');

          const start = (p - 1) * partSize;
          const end = Math.min(start + partSize, fileBuffer.length);
          const chunk = fileBuffer.subarray(start, end);

          const presignRes = await pageCsrep.evaluate(async ({ token, partNumber }) => {
            function generateCsrepHeaders() {
              const reqId = crypto.randomUUID();
              const timestamp = Date.now().toString();
              const str = `${reqId}${timestamp}`;
              let hash = 0;
              for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
              return {
                'Accept': 'application/json, text/plain, */*',
                'X-Request-ID': reqId,
                'X-Request-Timestamp': timestamp,
                'X-Request-Secret': (hash >>> 0).toString(36),
                'Content-Type': 'application/json',
              };
            }

            try {
              const res = await fetch('/api/uploads/_presign', {
                method: 'POST',
                headers: generateCsrepHeaders(),
                credentials: 'include',
                body: JSON.stringify({ token, part_number: partNumber }),
              });
              const json = await res.json();
              return json.result || json.url;
            } catch {
              return null;
            }
          }, { token, partNumber: p });

          if (!presignRes) throw new Error(`Не получен presign URL для части ${p}`);

          // Отправка части с 3 попытками
          await this.uploadChunkWithRetry(presignRes, chunk, 3, signal);

          completedChunks++;
          const pct = Math.round((completedChunks / partCount) * 100);
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedMb = elapsedSec > 0 ? ((completedChunks * 10) / elapsedSec).toFixed(1) : '0';

          this.mgr.updateProgress({
            activeMatchId: match.csrepMatchId,
            matchStatus: `Загрузка: ${pct}%`,
            matchStatusClass: 'uploading',
            filePercent: pct,
            speedInfo: `${speedMb} MB/s (${completedChunks}/${partCount})`,
          });
        }, concurrency);

        console.log(''); // Перенос строки после CLI progress-bar

        // Завершение загрузки и привязка к матчу
        this.mgr.log('[3/3] Привязываю демо к матчу на csrep.gg...');
        const completedId = await pageCsrep.evaluate(async ({ token, csrepMatchId, fileId }) => {
          function generateCsrepHeaders() {
            const reqId = crypto.randomUUID();
            const timestamp = Date.now().toString();
            const str = `${reqId}${timestamp}`;
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
            return {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': (hash >>> 0).toString(36),
              'Content-Type': 'application/json',
            };
          }

          const compRes = await fetch('/api/uploads/_complete', {
            method: 'POST',
            credentials: 'include',
            headers: generateCsrepHeaders(),
            body: JSON.stringify({ token }),
          });
          const compJson = await compRes.json();
          const finalFileId = (compJson.result && compJson.result.id) || fileId;

          await fetch(`/api/matches/${csrepMatchId}`, {
            method: 'POST',
            credentials: 'include',
            headers: generateCsrepHeaders(),
            body: JSON.stringify({ demo_url: `file://${finalFileId}` }),
          });

          return finalFileId;
        }, { token, csrepMatchId: match.csrepMatchId, fileId });

        this.mgr.log(`✅ [ГОТОВО] Демо успешно привязано к аналитике! (ID файла: ${completedId})`, 'success');
        this.mgr.saveHistory(match.csrepMatchId);
        successCount++;
        totalTraffic += fileBuffer.length / 1024 / 1024;

        this.mgr.updateStats({ uploaded: successCount, trafficMb: totalTraffic });
        this.updateMatchRowStatus(match.csrepMatchId, 'done', 'Загружено ✓');
      } catch (err) {
        if (signal.aborted) break;
        this.mgr.log(`❌ Ошибка матча: ${err.message}`, 'error');
        failedCount++;
        this.mgr.updateStats({ failed: failedCount });
        this.updateMatchRowStatus(match.csrepMatchId, 'failed', 'Ошибка');
      }
    }

    await this.saveCookies();
    await pageFaceit.close().catch(() => {});

    console.log('\n╔═════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         ИТОГИ СИНХРОНИЗАЦИИ                                 ║');
    console.log('╠═════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  ✅ Успешно загружено : ${String(successCount).padEnd(51)}║`);
    console.log(`║  ⚠️ Истёк срок FACEIT : ${String(skippedCount).padEnd(51)}║`);
    console.log(`║  ❌ Ошибок            : ${String(failedCount).padEnd(51)}║`);
    console.log(`║  📦 Общий трафик      : ${(totalTraffic.toFixed(1) + ' MB').padEnd(51)}║`);
    console.log('╚═════════════════════════════════════════════════════════════════════════════╝\n');

    this.mgr.setStatus('idle');
    this.mgr.updateProgress({
      overallPercent: 100,
      filePercent: 100,
      matchTitle: 'Завершено',
      speedInfo: '—',
    });

    if (process.platform === 'win32' && !signal.aborted) {
      this.sendToast('CSREP Demo Uploader', `Загрузка завершена! Успешно: ${successCount}`);
    }
  }

  updateMatchRowStatus(matchId, statusClass, statusText) {
    const target = this.mgr.state.matches.find(m => m.csrepMatchId === matchId);
    if (target) {
      target.statusClass = statusClass;
      target.statusText = statusText;
      this.mgr.emit('matches_found', { matches: this.mgr.state.matches });
    }
  }

  async uploadChunkWithRetry(putUrl, chunk, maxRetries = 3, signal = null) {
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal && signal.aborted) throw new Error('Aborted');
      try {
        const res = await fetch(putUrl, {
          method: 'PUT',
          body: chunk,
          headers: { 'Content-Type': 'application/octet-stream' },
          signal,
        });
        if (res.ok) return true;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        if (signal && signal.aborted) throw e;
        lastErr = e;
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
    throw lastErr;
  }

  async pMap(array, iterator, concurrency = 4) {
    const results = new Array(array.length);
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, array.length) }, async () => {
      while (index < array.length) {
        const i = index++;
        results[i] = await iterator(array[i], i);
      }
    });
    await Promise.all(workers);
    return results;
  }

  stop() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.mgr.setStatus('stopped');
      this.mgr.log('Получена команда остановки (AbortSignal)...', 'warn');
    }
  }

  sendToast(title, body) {
    const psScript = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
      $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $textNodes = $template.GetElementsByTagName("text")
      $textNodes.Item(0).AppendChild($template.CreateTextNode("${title}")) > $null
      $textNodes.Item(1).AppendChild($template.CreateTextNode("${body}")) > $null
      $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("FACEIT Uploader").Show($toast)
    `.replace(/\n/g, ' ');
    exec(`powershell -NoProfile -Command "${psScript}"`, () => {});
  }
}

const engine = new UploaderEngine(stateManager);

// ═════════════════════════════════════════════════════════════════════════════
// 3. HTTP ВЕБ-СЕРВЕР & SSE (REST API)
// ═════════════════════════════════════════════════════════════════════════════
class HttpServer {
  constructor(port, stateMgr, uploaderEngine) {
    this.port = port;
    this.mgr = stateMgr;
    this.engine = uploaderEngine;
    this.sseClients = new Set();

    // Подписка на события хранилища для рассылки клиентам SSE
    this.mgr.on('log', (entry) => this.broadcast({ type: 'log', ...entry }));
    this.mgr.on('matches_found', (data) => this.broadcast({ type: 'matches_found', ...data }));
    this.mgr.on('progress', (data) => this.broadcast({ type: 'progress', ...data }));
    this.mgr.on('stats', (data) => this.broadcast({ type: 'stats', ...data }));
    this.mgr.on('state', (data) => this.broadcast({ type: 'state', ...data }));
  }

  broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch { this.sseClients.delete(client); }
    }
  }

  start() {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // 1. Статика (index.html)
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const htmlPath = path.resolve('./public/index.html');
        if (fs.existsSync(htmlPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(htmlPath).pipe(res);
          return;
        }
      }

      // 2. SSE поток событий (EventStream)
      if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('\n');
        this.sseClients.add(res);
        req.on('close', () => this.sseClients.delete(res));

        // Мгновенная гидратация состояния (F5 snapshot recovery)
        res.write(`data: ${JSON.stringify({
          type: 'init',
          state: this.mgr.getSnapshot(),
        })}\n\n`);
        return;
      }

      // 3. REST: Получение состояния
      if (url.pathname === '/api/state' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.mgr.getSnapshot()));
        return;
      }

      // 4. REST: POST команды (start, scan, upload-single, stop)
      if (req.method === 'POST') {
        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk; });
        req.on('end', async () => {
          let payload = {};
          try { payload = JSON.parse(bodyStr); } catch {}

          res.writeHead(200, { 'Content-Type': 'application/json' });

          if (url.pathname === '/api/scan') {
            res.end(JSON.stringify({ ok: true }));
            this.engine.scan(payload.pages).catch(console.error);
            return;
          }

          if (url.pathname === '/api/start') {
            res.end(JSON.stringify({ ok: true }));
            let targetMatches = this.mgr.state.matches;

            if (payload.matchIds && Array.isArray(payload.matchIds) && payload.matchIds.length > 0) {
              targetMatches = this.mgr.state.matches.filter(m => payload.matchIds.includes(m.csrepMatchId));
            } else if (targetMatches.length === 0) {
              targetMatches = await this.engine.scan(payload.pages);
            }

            if (targetMatches.length > 0) {
              this.engine.uploadMatches(targetMatches).catch(console.error);
            }
            return;
          }

          if (url.pathname === '/api/upload-single') {
            res.end(JSON.stringify({ ok: true }));
            const single = this.mgr.state.matches.filter(m => m.csrepMatchId === payload.matchId);
            if (single.length > 0) {
              this.engine.uploadMatches(single).catch(console.error);
            }
            return;
          }

          if (url.pathname === '/api/stop') {
            res.end(JSON.stringify({ ok: true }));
            this.engine.stop();
            return;
          }

          res.end(JSON.stringify({ error: 'Unknown endpoint' }));
        });
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server = server;
    server.listen(this.port, () => {
      console.log(`🌐 Web Dashboard доступен по адресу: http://localhost:${this.port}`);
    });
  }

  close() {
    for (const client of this.sseClients) {
      try { client.end(); } catch {}
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. CLI КОНСОЛЬНЫЙ РЕНДЕРЕР (VIEW)
// ═════════════════════════════════════════════════════════════════════════════
class CliView {
  constructor(stateMgr) {
    this.mgr = stateMgr;

    this.mgr.on('log', ({ message, level, time }) => {
      let prefix = '';
      if (level === 'success') prefix = '✅ ';
      if (level === 'warn') prefix = '⚠️ ';
      if (level === 'error') prefix = '❌ ';
      console.log(`[${time}] ${prefix}${message}`);
    });

    this.mgr.on('progress', (prog) => {
      if (prog.filePercent !== undefined && prog.speedInfo && prog.speedInfo !== '—') {
        const barLength = 20;
        const filled = Math.round((prog.filePercent / 100) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        process.stdout.write(`\r[${bar}] ${prog.filePercent}% | ${prog.speedInfo} `);
      }
    });
  }
}

new CliView(stateManager);

// ═════════════════════════════════════════════════════════════════════════════
// 5. ТОЧКА ВХОДА (ENTRYPOINT)
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  const isAllMode = args.includes('--all');
  const isWatchMode = args.includes('--watch');
  const isUiOnly = args.includes('--ui');

  for (const arg of args) {
    if (arg.startsWith('--pages=')) stateManager.state.config.maxPages = parseInt(arg.split('=')[1]) || stateManager.state.config.maxPages;
    if (arg.startsWith('--concurrency=')) stateManager.state.config.chunkConcurrency = parseInt(arg.split('=')[1]) || stateManager.state.config.chunkConcurrency;
    if (arg.startsWith('--port=')) stateManager.state.config.webPort = parseInt(arg.split('=')[1]) || stateManager.state.config.webPort;
  }

  if (isAllMode) stateManager.state.config.maxPages = 100;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   CSREP & FACEIT Demo Uploader Pro (Event-Driven Architecture)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Steam ID: ${stateManager.state.config.steamId}`);
  console.log(`Режим: ${isWatchMode ? '👁️ Watch Mode (Демон)' : isAllMode ? '🚀 Загрузить ВСЕ (--all)' : isUiOnly ? '🌐 UI Dashboard Only' : 'Стандартный'}`);
  console.log(`Параллельность: ${stateManager.state.config.chunkConcurrency || 4}x`);

  // Запуск веб-сервера
  const webServer = new HttpServer(stateManager.state.config.webPort || 3333, stateManager, engine);
  webServer.start();

  // Сканирование и загрузка первого цикла (если не режим --ui)
  if (!isUiOnly) {
    const missing = await engine.scan();
    if (missing.length > 0) {
      await engine.uploadMatches(missing);
    }
  }

  // Режим фонового наблюдения (Watch Mode)
  if (isWatchMode) {
    const intervalMs = (stateManager.state.config.watchIntervalMinutes || 10) * 60 * 1000;
    stateManager.log(`[Watch Mode] Мониторинг активен. Проверка каждые ${stateManager.state.config.watchIntervalMinutes || 10} мин...`);
    setInterval(async () => {
      if (stateManager.state.status === 'idle') {
        stateManager.log('[Watch Mode] Запуск плановой проверки новых матчей...');
        const missing = await engine.scan();
        if (missing.length > 0) {
          await engine.uploadMatches(missing);
        }
      }
    }, intervalMs);
  }

  // Если не режим фонового демона (--watch) и не только UI (--ui), корректно выходим в консоль
  if (!isWatchMode && !isUiOnly) {
    console.log('🏁 Работа скрипта завершена. Консоль готова к новым командам.\n');
    await engine.close();
    webServer.close();
    process.exit(0);
  }
}

main().catch(console.error);
