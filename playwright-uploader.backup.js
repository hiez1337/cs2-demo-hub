import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Чтение конфигурации
const configPath = path.resolve('./config.json');
let config = {
  steamId: '76561198434644264',
  faceitApiKey: '97898eb5-657f-4d91-9c29-eaa74954bf58',
  maxPages: 3,
};

if (fs.existsSync(configPath)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (e) {
    console.error('Ошибка чтения config.json:', e.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   FACEIT Demo Auto-Uploader (Browser Automation) ');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Steam ID: ${config.steamId}`);

  const userDataDir = path.resolve('./.browser_session');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const tempDownloadsDir = path.resolve('./demos_temp');
  if (!fs.existsSync(tempDownloadsDir)) fs.mkdirSync(tempDownloadsDir, { recursive: true });

  console.log('\nЗапускаю браузер...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 860 },
    downloadsPath: tempDownloadsDir,
    acceptDownloads: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Загрузка кук из cookies.json (если есть)
  const cookiesFile = path.resolve('./cookies.json');
  let csrepAccessToken = '';
  if (fs.existsSync(cookiesFile)) {
    try {
      const rawCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
      let loaded = 0;

      for (const c of rawCookies) {
        if (!c.name || typeof c.value === 'undefined') continue;
        if (c.name === 'csrep-access-token') csrepAccessToken = c.value;

        const isFaceit = (c.domain && c.domain.includes('faceit')) || (c.url && c.url.includes('faceit'));
        const domainStr = isFaceit ? 'faceit.com' : 'csrep.gg';

        try {
          await context.addCookies([{
            name: String(c.name).trim(),
            value: String(c.value).trim(),
            domain: domainStr,
            path: '/',
          }]);
          loaded++;
        } catch {}
      }
      console.log(`✅ Успешно импортировано кук: ${loaded} из cookies.json!`);
    } catch (e) {
      console.warn('⚠️ Ошибка чтения cookies.json:', e.message);
    }
  }

  const pageCsrep = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('\nОткрываю csrep.gg...');
  await pageCsrep.goto(`https://csrep.gg/player/${config.steamId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pageCsrep.waitForTimeout(5000);

  // 1. Поиск матчей без демок через контекст csrep.gg
  console.log('Ищу матчи без демок на csrep.gg...');
  const missing = await pageCsrep.evaluate(async ({ steamId, maxPages, csrepAccessToken }) => {
    function generateCsrepHeaders() {
      const reqId = crypto.randomUUID();
      const timestamp = Date.now().toString();
      const str = `${reqId}${timestamp}`;
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
      const headers = {
        'Accept': 'application/json, text/plain, */*',
        'X-Request-ID': reqId,
        'X-Request-Timestamp': timestamp,
        'X-Request-Secret': (hash >>> 0).toString(36),
      };
      if (csrepAccessToken) headers['Authorization'] = `Bearer ${csrepAccessToken}`;
      return headers;
    }

    const resultList = [];
    for (let page = 1; page <= maxPages; page++) {
      try {
        const res = await fetch(
          `/api/players/${steamId}/matches?page=${page}&limit=20&sort%5Bkey%5D=date&sort%5Bdirection%5D=desc`,
          { headers: generateCsrepHeaders(), credentials: 'include' }
        );
        if (!res.ok) {
          console.error(`Page ${page} HTTP ${res.status}`);
          break;
        }
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
      } catch (e) {
        console.error(`Fetch err page ${page}:`, e.message);
        break;
      }
    }
    return resultList;
  }, { steamId: config.steamId, maxPages: config.maxPages || 1, csrepAccessToken });

  console.log(`Найдено матчей без демок: ${missing.length}`);

  if (missing.length === 0) {
    console.log('✅ Все демки уже загружены на csrep.gg!');
    await context.close();
    return;
  }

  // Создаем вкладку FACEIT
  console.log('\nОткрываю вкладку FACEIT...');
  const pageFaceit = await context.newPage();
  await pageFaceit.goto('https://www.faceit.com/ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await pageFaceit.waitForTimeout(2000);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < missing.length; i++) {
    const match = missing[i];
    const dateStr = new Date(match.date).toLocaleString('ru-RU');
    console.log(`\n━━━ [${i + 1}/${missing.length}] ${match.map} ${match.score} (${dateStr}) ━━━`);

    try {
      // 1. Получаем raw demo_url из FACEIT Open API
      const resFaceitApi = await fetch(`https://open.faceit.com/data/v4/matches/${match.faceitMatchId}`, {
        headers: { 'Authorization': `Bearer ${config.faceitApiKey}` },
      });

      if (!resFaceitApi.ok) {
        console.log(`⚠️ Не удалось получить информацию о матче (HTTP ${resFaceitApi.status})`);
        failedCount++;
        continue;
      }

      const faceitData = await resFaceitApi.json();
      if (!faceitData.demo_url || faceitData.demo_url.length === 0) {
        console.log('⚠️ Демо недоступно на FACEIT (срок хранения истёк)');
        skippedCount++;
        continue;
      }

      const rawUrl = Array.isArray(faceitData.demo_url) ? faceitData.demo_url[0] : faceitData.demo_url;

      // 2. Получаем подписанный URL скачивания прямо из контекста авторизованной вкладки FACEIT
      console.log('Запрашиваю signed URL через контекст FACEIT...');
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

      let fileBuffer = null;

      if (signedUrl) {
        console.log('Прямая ссылка получена ✓ Скачиваю файл демки...');
        const demoRes = await fetch(signedUrl);
        if (!demoRes.ok) throw new Error(`Ошибка скачивания: HTTP ${demoRes.status}`);
        const arrayBuf = await demoRes.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
      } else {
        // Фолбек: открытие комнаты матча и клик по кнопке
        const roomUrl = `https://www.faceit.com/ru/cs2/room/${match.faceitMatchId}`;
        console.log(`Пробую через открытие комнаты матча: ${roomUrl}`);
        await pageFaceit.goto(roomUrl, { waitUntil: 'domcontentloaded' });
        await pageFaceit.waitForTimeout(2000);

        const btnSelector = 'button:has-text("Смотреть демо"), button:has-text("Watch demo")';
        const demoBtn = await pageFaceit.$(btnSelector);
        if (!demoBtn) {
          console.log('⚠️ Кнопка демо не найдена на FACEIT');
          skippedCount++;
          continue;
        }

        const [download] = await Promise.all([
          pageFaceit.waitForEvent('download', { timeout: 20000 }).catch(() => null),
          demoBtn.click(),
        ]);

        if (download) {
          const downloadFilename = `${match.faceitMatchId}-1-1.dem.zst`;
          const filePath = path.join(tempDownloadsDir, downloadFilename);
          await download.saveAs(filePath);
          fileBuffer = fs.readFileSync(filePath);
          try { fs.unlinkSync(filePath); } catch {}
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('Не удалось получить файл демки');
      }

      console.log(`Файл готов: ${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB ✓`);

      // Загружаем на csrep.gg
      console.log('Инициализирую загрузку на csrep.gg...');
      const uploadFilename = `${match.faceitMatchId}-1-1.dem.zst`;

      // 1. Инициализация загрузки через контекст страницы
      const initData = await pageCsrep.evaluate(async ({ filename, size, csrepAccessToken }) => {
        function generateCsrepHeaders() {
          const reqId = crypto.randomUUID();
          const timestamp = Date.now().toString();
          const str = `${reqId}${timestamp}`;
          let hash = 0;
          for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
          const headers = {
            'Accept': 'application/json, text/plain, */*',
            'X-Request-ID': reqId,
            'X-Request-Timestamp': timestamp,
            'X-Request-Secret': (hash >>> 0).toString(36),
            'Content-Type': 'application/json',
          };
          if (csrepAccessToken) headers['Authorization'] = `Bearer ${csrepAccessToken}`;
          return headers;
        }

        try {
          const res = await fetch('/api/uploads/demos', {
            method: 'POST',
            credentials: 'include',
            headers: generateCsrepHeaders(),
            body: JSON.stringify({ filename, size }),
          });
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            return { ok: res.ok, status: res.status, result: json.result, error: json.error || text };
          } catch {
            return { ok: res.ok, status: res.status, error: text };
          }
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, { filename: uploadFilename, size: fileBuffer.length, csrepAccessToken });

      const resResult = initData.result || {};
      const token = resResult.token;
      const fileId = resResult.file ? resResult.file.id : resResult.id;

      if (!token) {
        console.error('Детали ответа csrep:', JSON.stringify(initData));
        throw new Error(`Не удалось инициализировать загрузку: отсутствует token в ответе`);
      }

      const partSize = 10 * 1024 * 1024; // 10MB
      const partCount = Math.ceil(fileBuffer.length / partSize);

      console.log(`Токен загрузки получен ✓ (Размер: ${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB, Частей: ${partCount})`);

      // 2. Отправка частей напрямую из Node.js Buffer в Cloudflare R2
      for (let p = 1; p <= partCount; p++) {
        const start = (p - 1) * partSize;
        const end = Math.min(start + partSize, fileBuffer.length);
        const chunk = fileBuffer.subarray(start, end);

        // Получаем presigned URL для части через POST /api/uploads/_presign
        const presignRes = await pageCsrep.evaluate(async ({ token, partNumber, csrepAccessToken }) => {
          function generateCsrepHeaders() {
            const reqId = crypto.randomUUID();
            const timestamp = Date.now().toString();
            const str = `${reqId}${timestamp}`;
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
            const headers = {
              'Accept': 'application/json, text/plain, */*',
              'X-Request-ID': reqId,
              'X-Request-Timestamp': timestamp,
              'X-Request-Secret': (hash >>> 0).toString(36),
              'Content-Type': 'application/json',
            };
            if (csrepAccessToken) headers['Authorization'] = `Bearer ${csrepAccessToken}`;
            return headers;
          }

          try {
            const res = await fetch('/api/uploads/_presign', {
              method: 'POST',
              headers: generateCsrepHeaders(),
              credentials: 'include',
              body: JSON.stringify({ token, part_number: partNumber }),
            });
            const text = await res.text();
            try {
              const json = JSON.parse(text);
              return { ok: res.ok, status: res.status, json, text };
            } catch {
              return { ok: res.ok, status: res.status, text };
            }
          } catch (e) {
            return { ok: false, error: e.message };
          }
        }, { token, partNumber: p, csrepAccessToken });

        const putUrl = presignRes && presignRes.json && (presignRes.json.result || presignRes.json.url);
        if (!putUrl) {
          console.error(`Детали presign части ${p}:`, JSON.stringify(presignRes));
          throw new Error(`Не получен presign URL для части ${p} (HTTP ${presignRes ? presignRes.status : 'ERR'})`);
        }

        // Отправляем бинарный чанк напрямую в Cloudflare R2
        const putRes = await fetch(putUrl, {
          method: 'PUT',
          body: chunk,
          headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!putRes.ok) throw new Error(`PUT part ${p} failed: HTTP ${putRes.status}`);

        const pct = Math.round((p / partCount) * 100);
        process.stdout.write(`\rЗагрузка частей: ${p}/${partCount} (${pct}%)`);
      }
      console.log('');

      // 3. Завершение загрузки и привязка к матчу
      console.log('Привязываю демо к матчу на csrep.gg...');
      const completedId = await pageCsrep.evaluate(async ({ token, csrepMatchId, fileId, csrepAccessToken }) => {
        function generateCsrepHeaders() {
          const reqId = crypto.randomUUID();
          const timestamp = Date.now().toString();
          const str = `${reqId}${timestamp}`;
          let hash = 0;
          for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
          const headers = {
            'Accept': 'application/json, text/plain, */*',
            'X-Request-ID': reqId,
            'X-Request-Timestamp': timestamp,
            'X-Request-Secret': (hash >>> 0).toString(36),
            'Content-Type': 'application/json',
          };
          if (csrepAccessToken) headers['Authorization'] = `Bearer ${csrepAccessToken}`;
          return headers;
        }

        const compRes = await fetch('/api/uploads/_complete', {
          method: 'POST',
          credentials: 'include',
          headers: generateCsrepHeaders(),
          body: JSON.stringify({ token }),
        });
        const compJson = await compRes.json();
        const finalFileId = (compJson.result && compJson.result.id) || fileId;

        const linkRes = await fetch(`/api/matches/${csrepMatchId}`, {
          method: 'POST',
          credentials: 'include',
          headers: generateCsrepHeaders(),
          body: JSON.stringify({ demo_url: `file://${finalFileId}` }),
        });
        const linkJson = await linkRes.json();

        return finalFileId;
      }, { token, csrepMatchId: match.csrepMatchId, fileId, csrepAccessToken });

      console.log(`✅ Демо успешно привязано к матчу! (ID файла: ${completedId})`);
      successCount++;
    } catch (err) {
      console.error(`❌ Ошибка матча:`, err.message);
      failedCount++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`ИТОГИ: Загружено: ${successCount} | Пропущено: ${skippedCount} | Ошибок: ${failedCount}`);
  console.log('═══════════════════════════════════════════════════');

  await context.close();
}

main().catch(console.error);
