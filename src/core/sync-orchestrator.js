import { sendToast } from '../infrastructure/notifier.js';
import { getMapTitle } from '../domain/maps.js';

export class SyncOrchestrator {
  constructor({
    config,
    stateStore,
    browserManager = null,
    faceitApiClient,
    faceitDownloader,
    csrepClient,
    csrepUploader,
    historyStore,
    chunkWorkerPool,
    sessionStore = null,
  }) {
    this.config = config;
    this.stateStore = stateStore;
    this.browserManager = browserManager;
    this.faceitApiClient = faceitApiClient;
    this.faceitDownloader = faceitDownloader;
    this.csrepClient = csrepClient;
    this.csrepUploader = csrepUploader;
    this.historyStore = historyStore;
    this.chunkWorkerPool = chunkWorkerPool;
    this.sessionStore = sessionStore;

    this.abortController = null;
  }

  async scan(pages = this.config.maxPages) {
    this.stateStore.setStatus('scanning');
    this.stateStore.log(`🔍 Сканирование csrep.gg (страниц: ${pages})...`);

    try {
      let missingMatches = [];

      const tokens = this.sessionStore?.loadTokens?.() || {};
      const steamId = this.config.steamId || tokens.steamId;
      const sessionToken = tokens.csrepToken || null;

      if (!steamId) {
        this.stateStore.log('⚠️ Steam ID не указан. Войдите через Steam или укажите ID в настройках.', 'warn');
        this.stateStore.setStatus('idle');
        return [];
      }

      if (this.browserManager) {
        const context = await this.browserManager.getContext(Boolean(this.config.headless));
        const pageCsrep = context.pages()[0] || await context.newPage();
        missingMatches = await this.csrepClient.getMissingMatches(pageCsrep, steamId, pages);
      } else {
        missingMatches = await this.csrepClient.getMissingMatchesDirect(steamId, sessionToken, pages);
      }

      this.stateStore.setMatches(missingMatches);

      const unhandled = missingMatches.filter(m => !this.historyStore.has(m.csrepMatchId));
      this.stateStore.log(`✅ Найдено матчей: ${missingMatches.length} (из них не загружено: ${unhandled.length})`);
      this.stateStore.setStatus('idle');
      return unhandled;
    } catch (e) {
      this.stateStore.log(`❌ Ошибка сканирования: ${e.message}`, 'error');
      this.stateStore.setStatus('error');
      return [];
    }
  }

  async uploadMatches(matchesToUpload) {
    if (!matchesToUpload || matchesToUpload.length === 0) {
      this.stateStore.log('✨ Нет матчей для загрузки.');
      this.stateStore.setStatus('idle');
      return;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.stateStore.setStatus('uploading');
    this.stateStore.log(`🚀 Старт конвейера загрузки для ${matchesToUpload.length} матчей...`);

    let pageCsrep = null;
    let pageFaceit = null;

    if (this.browserManager) {
      const context = await this.browserManager.getContext(Boolean(this.config.headless));
      pageCsrep = context.pages()[0] || await context.newPage();
      pageFaceit = await context.newPage();
      await pageFaceit.goto('https://www.faceit.com/ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pageFaceit.waitForTimeout(2000);
    }

    const tokens = this.sessionStore?.loadTokens?.() || {};
    const sessionToken = tokens.csrepToken || null;
    let uploadedCount = 0;
    for (let i = 0; i < matchesToUpload.length; i++) {
      if (signal.aborted) {
        this.stateStore.log('🛑 Процесс загрузки остановлен пользователем.');
        break;
      }

      const rawMatch = matchesToUpload[i];
      const matchId = rawMatch.id || rawMatch.csrepMatchId || rawMatch.matchId;
      const faceitId = rawMatch.faceit_id || rawMatch.faceitMatchId || rawMatch.faceitId || matchId;
      const match = {
        ...rawMatch,
        id: matchId,
        csrepMatchId: matchId,
        faceitMatchId: faceitId,
        faceit_id: faceitId,
      };

      const mapTitle = getMapTitle(match.map);
      this.stateStore.state.currentMatch = match;
      this.stateStore.updateMatchStatus(matchId, 'active', 'Скачивание с FACEIT...');
      if (this.historyStore?.updateStatus) {
        this.historyStore.updateStatus(matchId, 'uploading', 'Скачивание с FACEIT...');
      }
      this.stateStore.log(`[${i + 1}/${matchesToUpload.length}] 📥 Скачивание: ${mapTitle} (${match.score || '—'})`);

      try {
        // 1. Скачивание с FACEIT (многопоточно в RAM)
        const demoBuffer = this.browserManager
          ? await this.faceitDownloader.downloadDemo(
              match,
              pageFaceit,
              (prog) => {
                const speedMb = prog.speedMb || 0;
                const filePercent = prog.percent || 0;
                const compMb = prog.completedBytes ? (prog.completedBytes / (1024 * 1024)).toFixed(1) : ((filePercent / 100) * (match.demo_size || 140)).toFixed(1);
                const totMb = prog.totalSize ? (prog.totalSize / (1024 * 1024)).toFixed(1) : String(match.demo_size || 140);
                this.stateStore.updateProgress({
                  id: matchId,
                  matchId,
                  stage: 'downloading',
                  filePercent,
                  percent: filePercent,
                  speedInfo: `↓ ${speedMb} МБ/с`,
                  speedMBs: speedMb,
                  completedMb: compMb,
                  totalMb: totMb,
                  activeWorkers: 10,
                  chunkCurrent: 0,
                  chunkTotal: Math.ceil((match.demo_size || 140) / 4),
                });
              },
              signal,
              tokens.faceitToken || null
            )
          : await this.faceitDownloader.downloadDemoDirect(
              match,
              (prog) => {
                const speedMb = prog.speedMb || 0;
                const filePercent = prog.percent || 0;
                const compMb = prog.completedBytes ? (prog.completedBytes / (1024 * 1024)).toFixed(1) : ((filePercent / 100) * (match.demo_size || 140)).toFixed(1);
                const totMb = prog.totalSize ? (prog.totalSize / (1024 * 1024)).toFixed(1) : String(match.demo_size || 140);
                this.stateStore.updateProgress({
                  id: matchId,
                  matchId,
                  stage: 'downloading',
                  filePercent,
                  percent: filePercent,
                  speedInfo: `↓ ${speedMb} МБ/с`,
                  speedMBs: speedMb,
                  completedMb: compMb,
                  totalMb: totMb,
                  activeWorkers: 10,
                  chunkCurrent: 0,
                  chunkTotal: Math.ceil((match.demo_size || 140) / 4),
                });
              },
              signal,
              tokens.faceitToken || null
            );
        if (!demoBuffer || demoBuffer.length === 0) {
          if (signal.aborted) {
            this.stateStore.log('🛑 Процесс загрузки остановлен пользователем.');
            break;
          }
          const errMsg = (!tokens.faceitToken && !this.config.faceitApiKey)
            ? 'Требуется авторизация в FACEIT'
            : 'Демо недоступно на FACEIT (истек срок хранения 30 дней)';
          this.stateStore.log(`⚠️ ${errMsg}`, 'warn');
          this.stateStore.updateMatchStatus(matchId, 'failed', errMsg);
          if (this.historyStore?.updateStatus) {
            this.historyStore.updateStatus(matchId, 'failed', errMsg);
          }
          this.stateStore.state.stats.skipped++;
          continue;
        }

        const sizeMb = (demoBuffer.length / (1024 * 1024)).toFixed(1);
        this.stateStore.log(`📦 Демо получено (${sizeMb} MB). Инициализация multipart-загрузки...`);
        this.stateStore.updateMatchStatus(matchId, 'active', `Загрузка (${sizeMb} MB)...`);
        if (this.historyStore?.updateStatus) {
          this.historyStore.updateStatus(matchId, 'uploading', `Загрузка (${sizeMb} MB)...`);
        }

        // 2. Инициализация загрузки на CSREP
        const filename = `${match.faceitMatchId}.dem.zst`;
        const useBrowserContext = Boolean(pageCsrep || this.csrepUploader?.evaluateFn);
        const { token, fileId } = useBrowserContext
          ? await this.csrepUploader.initMultipartUpload(pageCsrep, filename, demoBuffer.length)
          : await this.csrepUploader.initMultipartDirect(filename, demoBuffer.length, sessionToken);

        // 3. Отправка чанков параллельно
        await this.chunkWorkerPool.upload(
          demoBuffer,
          (partNumber) => useBrowserContext
            ? this.csrepUploader.getPresignedUrl(pageCsrep, token, partNumber)
            : this.csrepUploader.getPresignedUrlDirect(token, partNumber, sessionToken),
          (progress) => {
            const speedMb = progress.speedMb || 0;
            const filePercent = progress.percent || 0;
            const completedChunks = progress.completedChunks || 0;
            const totalChunks = progress.totalChunks || 15;
            const demoMb = parseFloat(sizeMb) || (match.demo_size || 140);
            const compMb = ((filePercent / 100) * demoMb).toFixed(1);
            const totMb = demoMb.toFixed(1);
            this.stateStore.updateProgress({
              id: matchId,
              matchId,
              stage: 'uploading',
              filePercent,
              percent: filePercent,
              speedInfo: `▲ ${speedMb} МБ/с`,
              speedMBs: speedMb,
              completedMb: compMb,
              totalMb: totMb,
              activeWorkers: 4,
              chunkCurrent: completedChunks,
              chunkTotal: totalChunks,
              chunksCompleted: completedChunks,
              chunksTotal: totalChunks,
            });
          },
          signal
        );

        // 4. Финализация и привязка к матчу
        this.stateStore.log(`🔗 Финализация и привязка демо к матчу на csrep.gg...`);
        if (useBrowserContext) {
          await this.csrepUploader.completeUploadAndLink(pageCsrep, token, matchId, fileId);
        } else {
          await this.csrepUploader.completeUploadAndLinkDirect(token, matchId, fileId, sessionToken);
        }
        this.historyStore.add(matchId);
        this.stateStore.updateMatchStatus(matchId, 'done', 'Загружено ✓');
        if (this.historyStore?.updateStatus) {
          this.historyStore.updateStatus(matchId, 'uploaded', 'Загружено ✓');
        }
        this.stateStore.state.stats.uploaded++;
        uploadedCount++;
        this.stateStore.log(`✅ Демо успешно загружено и привязано!`, 'success');
        sendToast('Демо загружено', `${mapTitle} (${match.score || '—'})`);
      } catch (err) {
        if (signal.aborted) break;
        this.stateStore.log(`❌ Ошибка обработки матча ${matchId}: ${err.message}`, 'error');
        this.stateStore.updateMatchStatus(matchId, 'failed', err.message || 'Ошибка загрузки');
        if (this.historyStore?.updateStatus) {
          this.historyStore.updateStatus(matchId, 'failed', err.message || 'Ошибка загрузки');
        }
        this.stateStore.state.stats.failed++;
      }
    }
    if (this.browserManager) {
      try { await pageFaceit.close(); } catch {}
      await this.browserManager.saveCookies();
    }
    this.stateStore.setStatus('done');
    this.stateStore.log(`🎉 Синхронизация завершена. Успешно загружено: ${uploadedCount} демок.`);
    sendToast('CSREP Uploader', `Синхронизация завершена! Загружено: ${uploadedCount}`);
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.stateStore.setStatus('stopped');
  }

  async interactiveLogin(rl) {
    this.stateStore.log('🔑 Запуск браузера для авторизации...');
    await this.browserManager.close();

    const context = await this.browserManager.getContext(false); // Visible browser
    const pageCsrep = context.pages()[0] || await context.newPage();
    await pageCsrep.goto('https://csrep.gg/login', { waitUntil: 'domcontentloaded' });

    const pageFaceit = await context.newPage();
    await pageFaceit.goto('https://www.faceit.com/ru/login', { waitUntil: 'domcontentloaded' });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' 👉 Войдите в свои аккаунты csrep.gg и faceit.com в открывшемся браузере.');
    console.log(' 👉 Когда завершите вход, нажмите [Enter] в этой консоли.');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await rl.question('Нажмите Enter после успешного входа: ');
    await this.browserManager.saveCookies();
    await this.browserManager.close();
    console.log('✅ Сессия и куки успешно сохранены!');
  }
}
