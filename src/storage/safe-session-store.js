import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function getDefaultSessionPath() {
  if (process.env.SESSION_STORAGE_PATH) {
    return path.resolve(process.env.SESSION_STORAGE_PATH);
  }
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return path.resolve('./tests_temp_session/session_test.enc');
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'csrep-uploader', 'session.enc');
  }
  return path.resolve('./session.enc');
}

function detectSafeStorage() {
  if (process.versions && process.versions.electron) {
    try {
      const electron = require('electron');
      if (electron && typeof electron === 'object' && electron.safeStorage) {
        return electron.safeStorage;
      }
    } catch {}
  }
  return null;
}

export class SafeSessionStore {
  /**
   * @param {string|Object} [options] Custom storage path or options object { storagePath, safeStorage }
   */
  constructor(options = {}) {
    if (typeof options === 'string') {
      this.storagePath = options;
      this.safeStorageOverride = undefined;
    } else {
      this.storagePath = options.storagePath || getDefaultSessionPath();
      this.safeStorageOverride = options.safeStorage;
    }
  }

  /**
   * Get active safeStorage provider (real Electron or injected mock)
   */
  getSafeStorage() {
    if (this.safeStorageOverride !== undefined) {
      return this.safeStorageOverride;
    }
    return detectSafeStorage();
  }

  /**
   * Check if encryption is currently available
   * @returns {boolean}
   */
  isEncryptionAvailable() {
    const safeStorage = this.getSafeStorage();
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function') {
      try {
        return safeStorage.isEncryptionAvailable();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Save session tokens securely
   * @param {{ csrepToken?: string|null, faceitToken?: string|null, faceitNickname?: string|null, steamId?: string|null }} tokens
   * @returns {{ csrepToken: string|null, faceitToken: string|null, faceitNickname: string|null, steamId: string|null }}
   */
  saveTokens(tokens = {}) {
    const payload = {
      csrepToken: tokens.csrepToken || null,
      faceitToken: tokens.faceitToken || null,
      faceitNickname: tokens.faceitNickname || null,
      steamId: tokens.steamId || null,
    };

    const jsonStr = JSON.stringify(payload);
    const dir = path.dirname(path.resolve(this.storagePath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const safeStorage = this.getSafeStorage();
    if (safeStorage && this.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(jsonStr);
        const fileBuffer = Buffer.concat([Buffer.from('DPAPI:', 'utf8'), encrypted]);
        fs.writeFileSync(this.storagePath, fileBuffer);
        return payload;
      } catch (err) {
        // If native encryption fails, fall through to safe fallback
      }
    }

    // Safe fallback for tests / environments outside Electron
    const base64Str = Buffer.from(jsonStr, 'utf8').toString('base64');
    fs.writeFileSync(this.storagePath, `B64:${base64Str}`, 'utf8');
    return payload;
  }

  /**
   * Load session tokens from storage
   * @returns {{ csrepToken: string|null, faceitToken: string|null, faceitNickname: string|null, steamId: string|null }}
   */
  loadTokens() {
    const emptyResult = { csrepToken: null, faceitToken: null, faceitNickname: null, steamId: null };

    if (!fs.existsSync(this.storagePath)) {
      return emptyResult;
    }

    try {
      const buffer = fs.readFileSync(this.storagePath);
      if (buffer.length === 0) return emptyResult;

      // Check for DPAPI prefix
      if (buffer.subarray(0, 6).toString('utf8') === 'DPAPI:') {
        const encrypted = buffer.subarray(6);
        const safeStorage = this.getSafeStorage();
        if (safeStorage && typeof safeStorage.decryptString === 'function') {
          const decrypted = safeStorage.decryptString(encrypted);
          return { ...emptyResult, ...JSON.parse(decrypted) };
        }
      }

      // Check for B64 fallback prefix
      if (buffer.subarray(0, 4).toString('utf8') === 'B64:') {
        const b64 = buffer.subarray(4).toString('utf8');
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return { ...emptyResult, ...JSON.parse(json) };
      }

      // Fallback: try raw safeStorage decryption
      const safeStorage = this.getSafeStorage();
      if (safeStorage && typeof safeStorage.decryptString === 'function') {
        try {
          const decrypted = safeStorage.decryptString(buffer);
          return { ...emptyResult, ...JSON.parse(decrypted) };
        } catch {}
      }

      // Fallback: try base64 decode or direct JSON
      const text = buffer.toString('utf8');
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf8');
        return { ...emptyResult, ...JSON.parse(decoded) };
      } catch {}

      try {
        return { ...emptyResult, ...JSON.parse(text) };
      } catch {}

      return emptyResult;
    } catch {
      return emptyResult;
    }
  }

  /**
   * Delete stored tokens
   * @returns {boolean}
   */
  clearTokens() {
    if (fs.existsSync(this.storagePath)) {
      try {
        fs.unlinkSync(this.storagePath);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }
}

export const safeSessionStore = new SafeSessionStore();

export function saveTokens(tokens) {
  return safeSessionStore.saveTokens(tokens);
}

export function loadTokens() {
  return safeSessionStore.loadTokens();
}

export function clearTokens() {
  return safeSessionStore.clearTokens();
}

export default SafeSessionStore;
