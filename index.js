#!/usr/bin/env node

import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

import { globalConfig } from './src/config/index.js';
import { HistoryStore } from './src/storage/history-store.js';
import { CookieStore } from './src/storage/cookie-store.js';
import { BrowserManager } from './src/browser/browser-manager.js';
import { FaceitApiClient } from './src/api/faceit/client.js';
import { FaceitDownloader } from './src/api/faceit/downloader.js';
import { CsrepClient } from './src/api/csrep/client.js';
import { CsrepUploader } from './src/api/csrep/uploader.js';
import { ChunkWorkerPool } from './src/core/chunk-worker-pool.js';
import { AppStateStore } from './src/core/state-store.js';
import { SyncOrchestrator } from './src/core/sync-orchestrator.js';
import { registerProcessGuard } from './src/infrastructure/process-guard.js';
import { WebServer } from './src/server/web-server.js';
import { CliRenderer } from './src/cli/renderer.js';
import { showInteractiveMenu } from './src/cli/menu.js';
import { ensureSteamIdSetup } from './src/cli/setup-wizard.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
CSREP & FACEIT Demo Uploader Pro (Clean Architecture Edition)

Использование: node index.js [опции]

Опции:
  --all            Загрузить все недостающие демки за всё время
  --pages=N        Количество страниц матчей для проверки (по умолчанию 3)
  --concurrency=N  Количество одновременных потоков загрузки чанков (по умолчанию 4)
  --port=N         Порт для встроенного Web Studio дашборда (по умолчанию 3333)
  --watch          Запустить в режиме фонового демона (проверка каждые 10 мин)
  --login          Открыть браузер для входа в csrep.gg и faceit.com
  --ui             Запустить только Web Studio дашборд
  --help, -h       Показать эту справку
    `);
    process.exit(0);
  }

  // 1. Инициализация конфигурации
  const config = globalConfig.applyCliArgs(args);

  // 2. Инициализация зависимостей (DI)
  const historyStore = new HistoryStore(config.historyFile);
  const cookieStore = new CookieStore(config.cookiesFile);
  const browserManager = new BrowserManager(config, cookieStore);

  const faceitApiClient = new FaceitApiClient(config.faceitApiKey);
  const faceitDownloader = new FaceitDownloader(faceitApiClient, config.tempDownloadsDir);
  const csrepClient = new CsrepClient();
  const csrepUploader = new CsrepUploader();

  const chunkWorkerPool = new ChunkWorkerPool(config.chunkConcurrency, config.chunkSizeBytes);
  const stateStore = new AppStateStore(config, historyStore);

  // Вывод логов и прогресса в терминал
  stateStore.on('log', (entry) => {
    CliRenderer.log(entry.message, entry.type);
  });
  stateStore.on('progress', ({ progress }) => {
    if (progress && progress.filePercent !== undefined && progress.filePercent > 0) {
      process.stdout.write(`\r${CliRenderer.formatProgress(progress.filePercent, progress.speedInfo || '')}`);
      if (progress.filePercent === 100) console.log();
    }
  });

  const orchestrator = new SyncOrchestrator({
    config,
    stateStore,
    browserManager,
    faceitApiClient,
    faceitDownloader,
    csrepClient,
    csrepUploader,
    historyStore,
    chunkWorkerPool,
  });

  // 3. Регистрация перехватчика аварийного завершения
  registerProcessGuard(async () => {
    orchestrator.stop();
    await browserManager.close();
  });

  const isAllMode = args.includes('--all');
  const isWatchMode = args.includes('--watch');
  const isLoginMode = args.includes('--login');
  const isUiOnlyMode = args.includes('--ui');

  const rl = readline.createInterface({ input, output });

  if (isLoginMode) {
    await orchestrator.interactiveLogin(rl);
    rl.close();
    process.exit(0);
  }

  if (isUiOnlyMode) {
    const webServer = new WebServer(config.webPort, config.webHost, stateStore, orchestrator);
    webServer.start();
    rl.close();
    return;
  }

  if (isAllMode) {
    console.log('🚀 Запуск в пакетном режиме: загрузка ВСЕХ недостающих демок...');
    const unhandled = await orchestrator.scan(100);
    if (unhandled.length > 0) {
      await orchestrator.uploadMatches(unhandled);
    }
    rl.close();
    await browserManager.close();
    process.exit(0);
  }

  if (isWatchMode) {
    console.log(`⏱️  Watch Mode активирован. Период: каждые ${config.watchIntervalMinutes} мин.`);
    while (true) {
      const unhandled = await orchestrator.scan(config.maxPages);
      if (unhandled.length > 0) {
        await orchestrator.uploadMatches(unhandled);
      }
      console.log(`💤 Ожидание ${config.watchIntervalMinutes} минут...`);
      await new Promise(r => setTimeout(r, config.watchIntervalMinutes * 60 * 1000));
    }
  }

  // Интерактивный режим CLI по умолчанию
  await ensureSteamIdSetup(globalConfig, rl);
  const action = await showInteractiveMenu(rl, orchestrator, globalConfig);

  if (action === 'RUN_UI') {
    const webServer = new WebServer(config.webPort, config.webHost, stateStore, orchestrator);
    webServer.start();
    rl.close();
  }
}

main().catch(err => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});
