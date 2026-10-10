import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ConfigSchema } from './schema.js';

// Загрузка переменных окружения из .env
dotenv.config();

export class ConfigManager {
  constructor(customConfigPath = './config.json') {
    this.configPath = path.resolve(customConfigPath);
    this.config = this.load();
  }

  get() {
    return this.config;
  }

  load() {
    let fileConfig = {};
    if (fs.existsSync(this.configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (e) {
        console.warn(`[Config] Предупреждение при чтении ${this.configPath}: ${e.message}`);
      }
    }

    const raw = {
      steamId: process.env.STEAM_ID || fileConfig.steamId,
      faceitApiKey: process.env.FACEIT_API_KEY || fileConfig.faceitApiKey,
      maxPages: process.env.MAX_PAGES || fileConfig.maxPages,
      chunkConcurrency: process.env.CHUNK_CONCURRENCY || fileConfig.chunkConcurrency || fileConfig.concurrentUploads,
      chunkSizeBytes: process.env.CHUNK_SIZE_BYTES || fileConfig.chunkSizeBytes,
      webPort: process.env.WEB_PORT || fileConfig.webPort,
      webHost: process.env.WEB_HOST || '127.0.0.1',
      watchIntervalMinutes: process.env.WATCH_INTERVAL_MINUTES || fileConfig.watchIntervalMinutes,
      apiSecretToken: process.env.API_SECRET_TOKEN || fileConfig.apiSecretToken,
      headless: process.env.HEADLESS === 'true' || fileConfig.headless || false,
      tempDownloadsDir: process.env.TEMP_DOWNLOADS_DIR || fileConfig.tempDownloadsDir,
      browserSessionDir: process.env.BROWSER_SESSION_DIR || fileConfig.browserSessionDir,
      cookiesFile: process.env.COOKIES_FILE || fileConfig.cookiesFile,
      historyFile: process.env.HISTORY_FILE || fileConfig.historyFile,
    };

    for (const key of Object.keys(raw)) {
      if (raw[key] === undefined) delete raw[key];
    }

    const result = ConfigSchema.safeParse(raw);
    if (!result.success) {
      console.warn('[Config] Предупреждение валидации:', result.error.format());
      return ConfigSchema.parse({});
    }

    return result.data;
  }

  save(partialConfig = {}) {
    this.config = { ...this.config, ...partialConfig };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`[Config] Ошибка сохранения ${this.configPath}: ${e.message}`);
      return false;
    }
  }

  applyCliArgs(argv = process.argv.slice(2)) {
    for (const arg of argv) {
      if (arg.startsWith('--pages=')) {
        const p = parseInt(arg.split('=')[1]);
        if (!isNaN(p)) this.config.maxPages = p;
      }
      if (arg.startsWith('--concurrency=')) {
        const c = parseInt(arg.split('=')[1]);
        if (!isNaN(c)) this.config.chunkConcurrency = c;
      }
      if (arg.startsWith('--port=')) {
        const port = parseInt(arg.split('=')[1]);
        if (!isNaN(port)) this.config.webPort = port;
      }
      if (arg.startsWith('--steam=')) {
        this.config.steamId = arg.split('=')[1].trim();
      }
      if (arg === '--headless') {
        this.config.headless = true;
      }
    }
    return this.config;
  }
}

export const globalConfig = new ConfigManager();
