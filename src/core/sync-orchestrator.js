import { sendToast } from '../infrastructure/notifier.js';
import { getMapTitle } from '../domain/maps.js';

export class SyncOrchestrator {
  constructor({
    config,
    stateStore,
    browserManager,
    faceitApiClient,
    faceitDownloader,
    csrepClient,
    csrepUploader,
    historyStore,
    chunkWorkerPool,
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

    this.abortController = null;
  }

  async scan(pages = this.config.maxPages) {
    this.stateStore.setStatus('scanning');
    this.stateStore.log(`🔍 Сканирование csrep.gg (страниц: ${pages})...`);

    const context = await this.browserManager.getContext(Boolean(this.config.headless));
    const pageCsrep = context.pages()[0] || await context.newPage();

    try {
      const missingMatches = await this.csrepClient.getMissingMatches(pageCsrep, this.config.steamId, pages);
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

    const context = await this.browserManager.getContext(Boolean(this.config.headless));
    const pageCsrep = context.pages()[0] || await context.newPage();
    const pageFaceit = await context.newPage();

    await pageFaceit.goto('https://www.faceit.com/ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pageFaceit.waitForTimeout(2000);

    let uploadedCount = 0;

    for (let i = 0; i < matchesToUpload.length; i++) {
      if (signal.aborted) {
        this.stateStore.log('🛑 Процесс загрузки остановлен пользователем.');
        break;
      }

      const match = matchesToUpload[i];
      const mapTitle = getMapTitle(match.map);
      this.stateStore.state.currentMatch = match;
      this.stateStore.updateMatchStatus(match.csrepMatchId, 'active', 'Скачивание с FACEIT...');
      this.stateStore.log(`[${i + 1}/${matchesToUpload.length}] 📥 Скачивание: ${mapTitle} (${match.score || '—'})`);

      try {
        // 1. Скачивание с FACEIT (многопоточно в RAM)
        const demoBuffer = await this.faceitDownloader.downloadDemo(
          match,
          pageFaceit,
          (prog) => {
            this.stateStore.updateProgress({
              filePercent: prog.percent,
              speedInfo: `↓ ${prog.speedMb} MB/s`,
            });
          },
          signal
        );
        if (!demoBuffer || demoBuffer.length === 0) {
          this.stateStore.log(`⚠️ Демо недоступно на FACEIT (истек срок хранения 30 дней)`, 'warn');
          this.stateStore.updateMatchStatus(match.csrepMatchId, 'failed', 'Демо устарело (404)');
          this.stateStore.state.stats.skipped++;
          continue;
        }

        const sizeMb = (demoBuffer.length / (1024 * 1024)).toFixed(1);
        this.stateStore.log(`📦 Демо получено (${sizeMb} MB). Инициализация multipart-загрузки...`);
        this.stateStore.updateMatchStatus(match.csrepMatchId, 'active', `Загрузка (${sizeMb} MB)...`);

        // 2. Инициализация загрузки на CSREP
        const filename = `${match.faceitMatchId}.dem.zst`;
        const { token, fileId } = await this.csrepUploader.initMultipartUpload(pageCsrep, filename, demoBuffer.length);

        // 3. Отправка чанков параллельно
        await this.chunkWorkerPool.upload(
          demoBuffer,
          (partNumber) => this.csrepUploader.getPresignedUrl(pageCsrep, token, partNumber),
          (progress) => {
            this.stateStore.updateProgress({
              filePercent: progress.percent,
              speedInfo: `${progress.speedMb} MB/s`,
              chunksCompleted: progress.completedChunks,
              chunksTotal: progress.totalChunks,
            });
          },
          signal
        );

        // 4. Финализация и привязка к матчу
        this.stateStore.log(`🔗 Финализация и привязка демо к матчу на csrep.gg...`);
        await this.csrepUploader.completeUploadAndLink(pageCsrep, token, match.csrepMatchId, fileId);

        this.historyStore.add(match.csrepMatchId);
        this.stateStore.updateMatchStatus(match.csrepMatchId, 'done', 'Загружено ✓');
        this.stateStore.state.stats.uploaded++;
        uploadedCount++;
        this.stateStore.log(`✅ Демо успешно загружено и привязано!`, 'success');
        sendToast('Демо загружено', `${mapTitle} (${match.score || '—'})`);
      } catch (err) {
        if (signal.aborted) break;
        this.stateStore.log(`❌ Ошибка обработки матча ${match.csrepMatchId}: ${err.message}`, 'error');
        this.stateStore.updateMatchStatus(match.csrepMatchId, 'failed', 'Ошибка загрузки');
        this.stateStore.state.stats.failed++;
      }
    }

    try { await pageFaceit.close(); } catch {}
    await this.browserManager.saveCookies();

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
