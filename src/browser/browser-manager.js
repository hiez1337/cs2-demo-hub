import fs from 'fs';
import path from 'path';

let chromium = null;
export class BrowserManager {
  constructor(config, cookieStore) {
    this.config = config;
    this.cookieStore = cookieStore;
    this.userDataDir = path.resolve(this.config.browserSessionDir);
    this.tempDownloadsDir = path.resolve(this.config.tempDownloadsDir);
    this.context = null;

    if (!fs.existsSync(this.userDataDir)) fs.mkdirSync(this.userDataDir, { recursive: true });
    if (!fs.existsSync(this.tempDownloadsDir)) fs.mkdirSync(this.tempDownloadsDir, { recursive: true });
  }

  async getContext(headless = false) {
    if (this.context) return this.context;

    if (!chromium) {
      try {
        const pw = await import('playwright');
        chromium = pw.chromium;
      } catch (err) {
        throw new Error('Playwright is not installed or available: ' + err.message);
      }
    }

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless,
      viewport: { width: 1366, height: 860 },
      downloadsPath: this.tempDownloadsDir,
      acceptDownloads: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const rawCookies = this.cookieStore.load();
    if (rawCookies && rawCookies.length > 0) {
      const valid = this.cookieStore.normalizeForPlaywright(rawCookies);
      if (valid.length > 0) {
        await this.context.addCookies(valid).catch(() => {});
      }
    }

    return this.context;
  }

  async saveCookies() {
    if (!this.context) return;
    try {
      const cookies = await this.context.cookies(['https://csrep.gg', 'https://www.faceit.com']);
      if (cookies && cookies.length > 0) {
        this.cookieStore.save(cookies);
      }
    } catch {}
  }

  async close() {
    if (this.context) {
      await this.saveCookies();
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }
}
