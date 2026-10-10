import path from 'path';
import { readJsonSafe, writeJsonAtomic } from './atomic-file.js';

export class CookieStore {
  constructor(cookiesPath = './cookies.json') {
    this.cookiesPath = path.resolve(cookiesPath);
  }

  load() {
    return readJsonSafe(this.cookiesPath, []);
  }

  save(cookies) {
    if (!cookies || !Array.isArray(cookies)) return false;
    return writeJsonAtomic(this.cookiesPath, cookies);
  }

  normalizeForPlaywright(rawCookies) {
    if (!Array.isArray(rawCookies)) return [];
    const valid = [];

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

      valid.push(cookieObj);
    }

    return valid;
  }

  isExpired(cookies) {
    if (!cookies || cookies.length === 0) return true;
    const nowSec = Math.floor(Date.now() / 1000);

    const tokenCookie = cookies.find(c => c.name === 'csrep-access-token');
    if (tokenCookie && tokenCookie.value) {
      try {
        const parts = tokenCookie.value.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.exp && payload.exp - nowSec < 300) {
            return true;
          }
        }
      } catch {}
    }

    return false;
  }
}
