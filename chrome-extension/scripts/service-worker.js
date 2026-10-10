/**
 * Background Service Worker for CSREP & FACEIT Uploader Extension (Manifest V3)
 */

import { CsrepApiClient } from './csrep-api.js';
import { FaceitApiClient } from './faceit-api.js';
import { StreamUploader } from './stream-uploader.js';

class ExtensionSyncEngine {
  constructor() {
    this.csrepClient = new CsrepApiClient();
    this.faceitClient = new FaceitApiClient('97898eb5-657f-4d91-9c29-eaa74954bf58');
    this.abortController = null;

    this.state = {
      status: 'idle', // 'idle' | 'scanning' | 'syncing' | 'error'
      steamId: '76561198434644264',
      faceitApiKey: '97898eb5-657f-4d91-9c29-eaa74954bf58',
      maxPages: 3,
      concurrency: 4,
      currentProgress: {
        stage: '', // 'downloading' | 'uploading'
        percent: 0,
        speedMb: '0',
        detail: '',
      },
      stats: {
        total: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
      },
      logs: [],
    };

    this.init();
  }

  async init() {
    const data = await chrome.storage.local.get([
      'steamId',
      'faceitApiKey',
      'maxPages',
      'concurrency',
      'uploadedHistory',
      'logs',
    ]);

    if (data.steamId) this.state.steamId = data.steamId;
    if (data.faceitApiKey) this.state.faceitApiKey = data.faceitApiKey;
    if (data.maxPages) this.state.maxPages = data.maxPages;
    if (data.concurrency) this.state.concurrency = data.concurrency;
    if (data.logs) this.state.logs = data.logs.slice(-50);

    this.faceitClient.setApiKey(this.state.faceitApiKey);
  }

  log(msg, level = 'info') {
    const time = new Date().toLocaleTimeString('ru-RU');
    const entry = { time, msg, level };
    this.state.logs.push(entry);
    if (this.state.logs.length > 100) this.state.logs.shift();

    // Broadcast log
    chrome.runtime.sendMessage({ type: 'LOG_ENTRY', entry }).catch(() => {});
    chrome.storage.local.set({ logs: this.state.logs.slice(-50) }).catch(() => {});
  }

  broadcastState() {
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state: this.state }).catch(() => {});
  }

  async startSync() {
    if (this.state.status !== 'idle') return;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.state.status = 'scanning';
    this.log(`🔍 Сканирование ${this.state.maxPages} страниц csrep.gg для Steam ID: ${this.state.steamId}...`);
    this.broadcastState();

    try {
      // 1. Получение истории
      const historyData = await chrome.storage.local.get('uploadedHistory');
      const uploadedHistory = new Set(historyData.uploadedHistory || []);

      // 2. Сканирование CSREP с логгером
      const missingMatches = await this.csrepClient.getMissingMatches(
        this.state.steamId,
        this.state.maxPages,
        (msg, level) => this.log(msg, level)
      );
      const toUpload = missingMatches.filter(m => !uploadedHistory.has(m.csrepMatchId));

      this.state.stats.total = toUpload.length;
      this.log(`✅ Найдено матчей без демок: ${missingMatches.length} (новых для загрузки: ${toUpload.length})`);

      if (toUpload.length === 0) {
        this.log('✨ Все доступные демки уже синхронизированы!');
        this.state.status = 'idle';
        this.broadcastState();
        return;
      }

      this.state.status = 'syncing';
      this.broadcastState();

      for (let i = 0; i < toUpload.length; i++) {
        if (signal.aborted) break;

        const match = toUpload[i];
        this.log(`[${i + 1}/${toUpload.length}] 📥 Обработка матча: ${match.map.toUpperCase()} (${match.score || '—'})`);

        // Шаг 1: Получение ссылки с FACEIT
        const downloadUrl = await this.faceitClient.getDemoDownloadUrl(match.faceitMatchId, (msg, level) => this.log(msg, level));
        if (!downloadUrl) {
          this.log(`⚠️ Не удалось получить ссылку FACEIT: ${match.faceitMatchId}`, 'warn');
          this.state.stats.skipped++;
          this.broadcastState();
          continue;
        }

        // Шаг 2: Скачивание демо параллельными Range-чанками в RAM
        this.state.currentProgress.stage = 'Скачивание';
        this.log(`📥 Скачивание демо с FACEIT CDN...`);
        const fileBuffer = await StreamUploader.downloadDemoParallel(
          downloadUrl,
          (prog) => {
            this.state.currentProgress.percent = prog.percent;
            this.state.currentProgress.speedMb = prog.speedMb;
            this.state.currentProgress.detail = `${(prog.downloadedBytes / 1024 / 1024).toFixed(1)} / ${(prog.totalSize / 1024 / 1024).toFixed(1)} MB`;
            this.broadcastState();
          },
          signal,
          this.state.concurrency
        );

        if (!fileBuffer) {
          this.log(`❌ Ошибка скачивания демо для матча ${match.csrepMatchId}`, 'error');
          this.state.stats.failed++;
          this.broadcastState();
          continue;
        }

        const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);
        this.log(`📦 Демо получено (${sizeMb} MB). Инициализация multipart в CSREP...`);

        // Шаг 3: Инициализация multipart сессии на CSREP
        const filename = `${match.faceitMatchId}.dem.zst`;
        const { token, fileId } = await this.csrepClient.initMultipart(filename, fileBuffer.length);

        // Шаг 4: Загрузка чанков в Cloudflare R2
        this.state.currentProgress.stage = 'Загрузка';
        this.log(`🚀 Отправка в Cloudflare R2 (${this.state.concurrency}x параллельно)...`);
        await StreamUploader.uploadChunksToR2(
          fileBuffer,
          token,
          this.csrepClient,
          (prog) => {
            this.state.currentProgress.percent = prog.percent;
            this.state.currentProgress.speedMb = prog.speedMb;
            this.state.currentProgress.detail = `Часть ${prog.completedParts} из ${prog.totalParts}`;
            this.broadcastState();
          },
          signal,
          this.state.concurrency
        );

        // Шаг 5: Привязка к матчу
        this.log(`🔗 Привязываю загруженный файл к аналитике матча...`);
        await this.csrepClient.completeAndLink(token, match.csrepMatchId, fileId);

        uploadedHistory.add(match.csrepMatchId);
        await chrome.storage.local.set({ uploadedHistory: Array.from(uploadedHistory) });

        this.state.stats.uploaded++;
        this.log(`✅ Матч ${match.csrepMatchId} успешно синхронизирован!`, 'success');
        this.broadcastState();
      }

      this.log(`🎉 Синхронизация завершена! Загружено: ${this.state.stats.uploaded} демок.`);
    } catch (err) {
      if (signal.aborted) {
        this.log('🛑 Синхронизация остановлена пользователем.', 'warn');
      } else {
        this.log(`❌ Критическая ошибка синхронизации: ${err.message}`, 'error');
      }
    } finally {
      this.state.status = 'idle';
      this.state.currentProgress = { stage: '', percent: 0, speedMb: '0', detail: '' };
      this.broadcastState();
    }
  }

  stopSync() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.state.status = 'idle';
    this.broadcastState();
  }
}

const engine = new ExtensionSyncEngine();

// Обработка сообщений из Popup и Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    sendResponse(engine.state);
    return true;
  }

  if (message.type === 'START_SYNC') {
    engine.startSync();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'STOP_SYNC') {
    engine.stopSync();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    const { steamId, faceitApiKey, maxPages, concurrency } = message.settings;
    if (steamId) engine.state.steamId = steamId;
    if (faceitApiKey) engine.state.faceitApiKey = faceitApiKey;
    if (maxPages) engine.state.maxPages = Number(maxPages);
    if (concurrency) engine.state.concurrency = Number(concurrency);
    engine.faceitClient.setApiKey(engine.state.faceitApiKey);

    chrome.storage.local.set({
      steamId: engine.state.steamId,
      faceitApiKey: engine.state.faceitApiKey,
      maxPages: engine.state.maxPages,
      concurrency: engine.state.concurrency,
    });

    engine.log('⚙️ Настройки сохранены.');
    engine.broadcastState();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ uploadedHistory: [] }).then(() => {
      engine.log('🧹 История загруженных матчей очищена.');
      engine.state.stats = { total: 0, uploaded: 0, skipped: 0, failed: 0 };
      engine.broadcastState();
      sendResponse({ ok: true });
    });
    return true;
  }
});
