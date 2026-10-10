import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// ═══════════════════════════════════════════════
// 1. КОНФИГУРАЦИЯ И АРГУМЕНТЫ
// ═══════════════════════════════════════════════
const configPath = path.resolve('./config.json');
let config = {
  steamId: '76561198434644264',
  faceitApiKey: '97898eb5-657f-4d91-9c29-eaa74954bf58',
  maxPages: 3,
  chunkConcurrency: 4,
  webPort: 3333,
  watchIntervalMinutes: 10,
};

if (fs.existsSync(configPath)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (e) {
    console.error('Ошибка чтения config.json:', e.message);
  }
}

// Аргументы CLI
const args = process.argv.slice(2);
let isAllMode = args.includes('--all');
let isWatchMode = args.includes('--watch');
let isHeadless = args.includes('--headless');
let isUiOnly = args.includes('--ui');

for (const arg of args) {
  if (arg.startsWith('--pages=')) config.maxPages = parseInt(arg.split('=')[1]) || config.maxPages;
  if (arg.startsWith('--concurrency=')) config.chunkConcurrency = parseInt(arg.split('=')[1]) || config.chunkConcurrency;
  if (arg.startsWith('--port=')) config.webPort = parseInt(arg.split('=')[1]) || config.webPort;
}

if (isAllMode) config.maxPages = 100;

// История успешно загруженных матчей
const historyFile = path.resolve('./uploaded_history.json');
let uploadedHistory = new Set();
if (fs.existsSync(historyFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    if (Array.isArray(raw)) uploadedHistory = new Set(raw);
  } catch {}
}

function saveHistory(matchId) {
  uploadedHistory.add(matchId);
  try {
    fs.writeFileSync(historyFile, JSON.stringify([...uploadedHistory], null, 2), 'utf8');
  } catch {}
}

// ═══════════════════════════════════════════════
// 2. СИСТЕМА УВЕДОМЛЕНИЙ И ЛОГОВ
// ═══════════════════════════════════════════════
const sseClients = new Set();

function broadcastEvent(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

function log(message, level = 'info') {
  const time = new Date().toLocaleTimeString('ru-RU');
  let prefix = '';
  if (level === 'success') prefix = '✅ ';
  if (level === 'warn') prefix = '⚠️ ';
  if (level === 'error') prefix = '❌ ';

  console.log(`[${time}] ${prefix}${message}`);
  broadcastEvent({ type: 'log', message, level, time });
}

function sendToast(title, body) {
  if (process.platform === 'win32') {
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

// ═══════════════════════════════════════════════
// 3. SMART RETRY ДЛЯ ЧАНКОВ
// ═══════════════════════════════════════════════
async function uploadChunkWithRetry(putUrl, chunk, maxRetries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(putUrl, {
        method: 'PUT',
        body: chunk,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (res.ok) return true;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════════════
// 4. ПАРАЛЛЕЛЬНОЕ ВЫПОЛНЕНИЕ (pMap)
// ═══════════════════════════════════════════════
async function pMap(array, iterator, concurrency = 4) {
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

// ═══════════════════════════════════════════════
// 5. ВСТРОЕННЫЙ WEB-СЕРВЕР (DASHBOARD)
// ═══════════════════════════════════════════════
let isProcessing = false;
let globalContext = null;
let currentMissingMatches = [];
let totalTrafficBytes = 0;

function startWebServer(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const htmlPath = path.resolve('./public/index.html');
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(htmlPath).pipe(res);
        return;
      }
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));

      // Отправляем текущее состояние клиенту
      res.write(`data: ${JSON.stringify({
        type: 'state',
        isRunning: isProcessing,
        matches: currentMissingMatches,
      })}\n\n`);
      return;
    }

    if ((url.pathname === '/api/start' || url.pathname === '/api/scan') && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(bodyStr); } catch {}
        const reqPages = payload.pages ? parseInt(payload.pages) : config.maxPages;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pages: reqPages }));

        if (url.pathname === '/api/start') {
          if (!isProcessing) runUploaderCycle(reqPages).catch(console.error);
        } else if (url.pathname === '/api/scan') {
          scanMatchesOnly(reqPages).catch(console.error);
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`🌐 Web Dashboard доступен по адресу: http://localhost:${port}`);
  });
}

// ═══════════════════════════════════════════════
// 6. СКАНИРОВАНИЕ И ЗАГРУЗКА МАТЧЕЙ
// ═══════════════════════════════════════════════
async function getBrowserContext() {
  if (globalContext) return globalContext;

  const userDataDir = path.resolve('./.browser_session');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const tempDownloadsDir = path.resolve('./demos_temp');
  if (!fs.existsSync(tempDownloadsDir)) fs.mkdirSync(tempDownloadsDir, { recursive: true });

  log('Запускаю браузерный движок...');
  globalContext = await chromium.launchPersistentContext(userDataDir, {
    headless: isHeadless ? true : false,
    viewport: { width: 1366, height: 860 },
    downloadsPath: tempDownloadsDir,
    acceptDownloads: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Импорт кук
  const cookiesFile = path.resolve('./cookies.json');
  if (fs.existsSync(cookiesFile)) {
    try {
      const rawCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
      for (const c of rawCookies) {
        if (!c.name || typeof c.value === 'undefined') continue;
        const isFaceit = (c.domain && c.domain.includes('faceit')) || (c.url && c.url.includes('faceit'));
        const domainStr = isFaceit ? 'faceit.com' : 'csrep.gg';
        try {
          await globalContext.addCookies([{
            name: String(c.name).trim(),
            value: String(c.value).trim(),
            domain: domainStr,
            path: '/',
          }]);
        } catch {}
      }
    } catch {}
  }

  return globalContext;
}

async function saveCookies(context) {
  try {
    const cookies = await context.cookies(['https://csrep.gg', 'https://www.faceit.com']);
    if (cookies && cookies.length > 0) {
      fs.writeFileSync(path.resolve('./cookies.json'), JSON.stringify(cookies, null, 2), 'utf8');
    }
  } catch {}
}

async function scanMatchesOnly(customPages = null) {
  const pagesToScan = customPages || config.maxPages || 1;
  const context = await getBrowserContext();
  const pageCsrep = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  log(`Открываю csrep.gg для сканирования (${pagesToScan} стр)...`);
  await pageCsrep.goto(`https://csrep.gg/player/${config.steamId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pageCsrep.waitForTimeout(4000);
  await saveCookies(context);

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
  }, { steamId: config.steamId, maxPages: pagesToScan });

  currentMissingMatches = missing;
  log(`Найдено матчей без демок: ${missing.length}`);
  broadcastEvent({ type: 'matches_found', matches: missing });
  return missing;
}

async function runUploaderCycle(customPages = null) {
  if (isProcessing) return;
  isProcessing = true;
  broadcastEvent({ type: 'state', isRunning: true });

  const context = await getBrowserContext();
  const pageCsrep = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const missing = await scanMatchesOnly(customPages);

  if (missing.length === 0) {
    log('Все демки уже загружены на csrep.gg! 🎉', 'success');
    isProcessing = false;
    broadcastEvent({ type: 'state', isRunning: false });
    return;
  }

  // Создаем вкладку FACEIT
  const pageFaceit = await context.newPage();
  await pageFaceit.goto('https://www.faceit.com/ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pageFaceit.waitForTimeout(2000);

  async function downloadMatchDemo(match) {
    try {
      const resFaceitApi = await fetch(`https://open.faceit.com/data/v4/matches/${match.faceitMatchId}`, {
        headers: { 'Authorization': `Bearer ${config.faceitApiKey}` },
      });
      if (!resFaceitApi.ok) return null;

      const faceitData = await resFaceitApi.json();
      if (!faceitData.demo_url || faceitData.demo_url.length === 0) return null;
      const rawUrl = Array.isArray(faceitData.demo_url) ? faceitData.demo_url[0] : faceitData.demo_url;

      let signedUrl = await pageFaceit.evaluate(async (url) => {
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
          return json.payload ? json.payload.download_url : null;
        } catch {
          return null;
        }
      }, rawUrl);

      if (signedUrl) {
        const demoRes = await fetch(signedUrl);
        if (!demoRes.ok) return null;
        const arrayBuf = await demoRes.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch {}
    return null;
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Конвейер предзагрузки следующего файла
  let nextDownloadPromise = downloadMatchDemo(missing[0]);

  for (let i = 0; i < missing.length; i++) {
    const match = missing[i];
    const mapEmojis = {
      de_mirage: '🏛️ Mirage',
      de_dust2: '🏜️ Dust II',
      de_ancient: '🌿 Ancient',
      de_anubis: '🏺 Anubis',
      de_inferno: '🔔 Inferno',
      de_nuke: '☢️ Nuke',
      de_vertigo: '🏢 Vertigo',
    };
    const mapTitle = mapEmojis[match.map] || match.map;
    const matchTitle = `${mapTitle} (${match.score || ''})`;

    log(`\n━━━━━━━━━ [${i + 1}/${missing.length}] ${matchTitle} ━━━━━━━━━`);

    broadcastEvent({
      type: 'progress',
      activeMatchId: match.csrepMatchId,
      matchTitle,
      matchStatus: 'Скачивание с FACEIT...',
      matchStatusClass: 'uploading',
      overallPercent: Math.round(((i) / missing.length) * 100),
      filePercent: 0,
      inProgressCount: 1,
    });

    try {
      const fileBuffer = await nextDownloadPromise;

      if (i + 1 < missing.length) {
        nextDownloadPromise = downloadMatchDemo(missing[i + 1]).catch(() => null);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        log('Демка недоступна на FACEIT (истёк срок хранения)', 'warn');
        skippedCount++;
        broadcastEvent({
          type: 'progress',
          activeMatchId: match.csrepMatchId,
          matchStatus: 'Истёк срок хранения',
          matchStatusClass: 'failed',
        });
        continue;
      }

      const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);
      log(`Файл готов: ${sizeMb} MB ✓`);

      const uploadFilename = `${match.faceitMatchId}-1-1.dem.zst`;

      // 1. Инициализация загрузки
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
          const json = await res.json();
          return json;
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
      const concurrency = config.chunkConcurrency || 4;

      log(`Отправка в Cloudflare R2 (${partCount} частей, ${concurrency}x параллельно)...`);

      const partIndices = Array.from({ length: partCount }, (_, idx) => idx + 1);
      let completedChunks = 0;
      const startTime = Date.now();

      await pMap(partIndices, async (p) => {
        const start = (p - 1) * partSize;
        const end = Math.min(start + partSize, fileBuffer.length);
        const chunk = fileBuffer.subarray(start, end);

        // Presign URL
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

        // Загрузка с автоматическим ретраем
        await uploadChunkWithRetry(presignRes, chunk, 3);

        completedChunks++;
        const pct = Math.round((completedChunks / partCount) * 100);
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMb = elapsedSec > 0 ? ((completedChunks * 10) / elapsedSec).toFixed(1) : '0';

        // Обновление прогресс-бара в CLI и Web UI
        const barLength = 20;
        const filled = Math.round((pct / 100) * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        process.stdout.write(`\r[${bar}] ${pct}% | ${completedChunks}/${partCount} частей (${speedMb} MB/s) `);

        broadcastEvent({
          type: 'progress',
          activeMatchId: match.csrepMatchId,
          matchStatus: `Загрузка: ${pct}%`,
          matchStatusClass: 'uploading',
          filePercent: pct,
          speedInfo: `${speedMb} MB/s (${completedChunks}/${partCount})`,
        });
      }, concurrency);

      console.log('');

      // 3. Завершение загрузки и привязка
      log('Привязываю демо к матчу на csrep.gg...');
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

      log(`Демо успешно привязано! (ID файла: ${completedId})`, 'success');
      saveHistory(match.csrepMatchId);
      successCount++;
      totalTrafficBytes += fileBuffer.length;

      broadcastEvent({
        type: 'progress',
        activeMatchId: match.csrepMatchId,
        matchStatus: 'Загружено ✓',
        matchStatusClass: 'done',
        uploadedCount: successCount,
        trafficMb: totalTrafficBytes / 1024 / 1024,
        overallPercent: Math.round(((i + 1) / missing.length) * 100),
      });
    } catch (err) {
      log(`Ошибка матча: ${err.message}`, 'error');
      failedCount++;
      broadcastEvent({
        type: 'progress',
        activeMatchId: match.csrepMatchId,
        matchStatus: 'Ошибка',
        matchStatusClass: 'failed',
      });
    }
  }

  await saveCookies(context);
  await pageFaceit.close().catch(() => {});

  log('\n═══════════════════════════════════════════════════');
  log(`🎉 ИТОГИ: Загружено: ${successCount} | Пропущено: ${skippedCount} | Ошибок: ${failedCount}`, 'success');
  log('═══════════════════════════════════════════════════');

  sendToast('CSREP Demo Uploader', `Загрузка завершена! Успешно: ${successCount}, Ошибок: ${failedCount}`);

  isProcessing = false;
  broadcastEvent({
    type: 'state',
    isRunning: false,
    inProgressCount: 0,
  });
}

// ═══════════════════════════════════════════════
// 7. ЗАПУСК
// ═══════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   CSREP & FACEIT Demo Uploader Pro (Dashboard)   ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Steam ID: ${config.steamId}`);
  console.log(`Режим: ${isWatchMode ? '👁️ Watch Mode (Демон)' : isAllMode ? '🚀 Загрузить ВСЕ (--all)' : 'Стандартный'}`);
  console.log(`Параллельность: ${config.chunkConcurrency || 4}x`);

  // Запуск локального Web Dashboard
  startWebServer(config.webPort || 3333);

  // Запуск первого цикла загрузки
  if (!isUiOnly) {
    await runUploaderCycle();
  }

  // Режим фонового наблюдения (Watch Mode)
  if (isWatchMode) {
    const intervalMs = (config.watchIntervalMinutes || 10) * 60 * 1000;
    log(`[Watch Mode] Мониторинг активен. Проверка каждые ${config.watchIntervalMinutes || 10} мин...`, 'info');
    setInterval(() => {
      if (!isProcessing) {
        log('[Watch Mode] Запуск плановой проверки новых матчей...', 'info');
        runUploaderCycle().catch(console.error);
      }
    }, intervalMs);
  }
}

main().catch(console.error);
