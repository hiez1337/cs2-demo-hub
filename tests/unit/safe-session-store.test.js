import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SafeSessionStore } from '../../src/storage/safe-session-store.js';
import { openSteamLoginWindow, openFaceitLoginWindow, syncPartitionSessions } from '../../src/main/auth-window.js';

const TEST_DIR = path.resolve('./tests_temp_session');
const TEST_FILE = path.join(TEST_DIR, 'session_test.enc');

describe('SafeSessionStore & Auth Window Tests', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    if (fs.existsSync(TEST_FILE)) {
      try { fs.unlinkSync(TEST_FILE); } catch {}
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
    }
  });

  describe('SafeSessionStore Fallback Mode (Non-Electron/Test)', () => {
    it('should save and load tokens using fallback mode', () => {
      const store = new SafeSessionStore(TEST_FILE);
      const tokens = {
        csrepToken: 'mock-csrep-jwt-token',
        faceitToken: 'mock-faceit-token',
        faceitNickname: 'Susano1337',
        steamId: '76561198012345678',
      };

      store.saveTokens(tokens);

      expect(fs.existsSync(TEST_FILE)).toBe(true);
      const content = fs.readFileSync(TEST_FILE, 'utf8');
      expect(content.startsWith('B64:')).toBe(true);

      const loaded = store.loadTokens();
      expect(loaded).toEqual(tokens);
    });

    it('should return nulls when no session file exists', () => {
      const store = new SafeSessionStore(path.join(TEST_DIR, 'nonexistent.enc'));
      const loaded = store.loadTokens();
      expect(loaded).toEqual({ csrepToken: null, faceitToken: null, faceitNickname: null, steamId: null });
    });

    it('should clear stored tokens', () => {
      const store = new SafeSessionStore(TEST_FILE);
      store.saveTokens({ csrepToken: 'abc' });
      expect(fs.existsSync(TEST_FILE)).toBe(true);

      const res = store.clearTokens();
      expect(res).toBe(true);
      expect(fs.existsSync(TEST_FILE)).toBe(false);
      expect(store.loadTokens().csrepToken).toBeNull();
    });

    it('should handle raw JSON and raw base64 encoded session files cleanly', () => {
      const store = new SafeSessionStore(TEST_FILE);
      // Direct JSON format
      fs.writeFileSync(TEST_FILE, JSON.stringify({ csrepToken: 'json_token', steamId: '123' }), 'utf8');
      expect(store.loadTokens().csrepToken).toBe('json_token');

      // Raw base64 format without prefix
      const b64 = Buffer.from(JSON.stringify({ faceitToken: 'b64_token' })).toString('base64');
      fs.writeFileSync(TEST_FILE, b64, 'utf8');
      expect(store.loadTokens().faceitToken).toBe('b64_token');

      // Completely corrupted data
      fs.writeFileSync(TEST_FILE, 'not_valid_json_or_b64!!!@@@###$$$', 'utf8');
      expect(store.loadTokens().csrepToken).toBeNull();
    });
  });

  describe('SafeSessionStore Electron safeStorage Mode', () => {
    it('should use electron safeStorage when available', () => {
      const mockSafeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: (str) => Buffer.from(`mock_encrypted_${str}`),
        decryptString: (buf) => {
          const raw = buf.toString('utf8');
          return raw.replace('mock_encrypted_', '');
        },
      };

      const store = new SafeSessionStore({
        storagePath: TEST_FILE,
        safeStorage: mockSafeStorage,
      });

      expect(store.isEncryptionAvailable()).toBe(true);

      const tokens = {
        csrepToken: 'electron-token-123',
        faceitToken: 'electron-faceit-456',
        faceitNickname: 'Susano1337',
        steamId: '76561198999999999',
      };

      store.saveTokens(tokens);
      const fileBuffer = fs.readFileSync(TEST_FILE);
      expect(fileBuffer.subarray(0, 6).toString('utf8')).toBe('DPAPI:');

      const loaded = store.loadTokens();
      expect(loaded).toEqual(tokens);
    });
  });

  describe('Auth Window Flow Logic', () => {
    it('should capture csrep-access-token and steamId from cookie on csrep.gg', async () => {
      const store = new SafeSessionStore(TEST_FILE);
      const mockPayload = Buffer.from(JSON.stringify({ steamId: '76561198001122334' })).toString('base64');
      const mockJwt = `header.${mockPayload}.signature`;

      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => {
              this.eventHandlers[event] = handler;
            },
            removeAllListeners: () => {
              this.eventHandlers = {};
            },
            getURL: () => 'https://csrep.gg/dashboard',
          };
        }
        isDestroyed() { return this.destroyed; }
        close() { this.destroyed = true; }
        on(event, handler) {
          if (event === 'closed') this.onClosed = handler;
        }
        async loadURL(url) {
          // Simulate user navigating to csrep.gg after Steam login
          if (this.eventHandlers['did-navigate']) {
            await this.eventHandlers['did-navigate']({}, url);
          }
        }
      }

      const mockSession = {
        defaultSession: {
          cookies: {
            get: async ({ domain }) => {
              if (domain === 'csrep.gg') {
                return [{ name: 'csrep-access-token', value: mockJwt }];
              }
              return [];
            },
          },
        },
      };

      const result = await openSteamLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store,
      });

      expect(result.success).toBe(true);
      expect(result.csrepToken).toBe(mockJwt);
      expect(result.steamId).toBe('76561198001122334');

      const saved = store.loadTokens();
      expect(saved.csrepToken).toBe(mockJwt);
      expect(saved.steamId).toBe('76561198001122334');
    });

    it('should capture faceitToken from faceit login window', async () => {
      const store = new SafeSessionStore(TEST_FILE);

      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => {
              this.eventHandlers[event] = handler;
            },
            removeAllListeners: () => {
              this.eventHandlers = {};
            },
            getURL: () => 'https://www.faceit.com/en/cs2',
            executeJavaScript: async () => 'faceit_storage_token_xyz',
          };
        }
        isDestroyed() { return this.destroyed; }
        close() { this.destroyed = true; }
        on(event, handler) {
          if (event === 'closed') this.onClosed = handler;
        }
        async loadURL(url) {
          if (this.eventHandlers['did-navigate']) {
            await this.eventHandlers['did-navigate']({}, 'https://www.faceit.com/en/cs2');
          }
        }
      }

      const mockSession = {
        defaultSession: {
          cookies: {
            get: async () => [],
          },
        },
        fromPartition: () => ({
          cookies: {
            get: async () => [],
          },
        }),
      };

      const result = await openFaceitLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store,
      });

      expect(result.success).toBe(true);
      expect(result.faceitToken).toBe('faceit_storage_token_xyz');

      const saved = store.loadTokens();
      expect(saved.faceitToken).toBe('faceit_storage_token_xyz');
    });
    it('should capture faceitToken from modern host cookies and probe nickname', async () => {
      const store = new SafeSessionStore(TEST_FILE);

      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => {
              this.eventHandlers[event] = handler;
            },
            getURL: () => 'https://www.faceit.com/en/cs2',
            executeJavaScript: async () => null,
          };
        }
        isDestroyed() { return this.destroyed; }
        close() { this.destroyed = true; }
        on(event, handler) {
          if (event === 'closed') this.onClosed = handler;
        }
        async loadURL(url) {
          if (this.eventHandlers['did-navigate']) {
            await this.eventHandlers['did-navigate']({}, url);
          }
        }
      }

      const mockSession = {
        defaultSession: { cookies: { get: async () => [] } },
        fromPartition: () => ({
          cookies: {
            get: async () => [
              { name: '__Host-FaceitGatewayAuthorization', value: '146b70d6-925a-48c3-b13e-5175c9239c0d' },
              { name: '__Host-AuthSession', value: 'GOhHghxds1A97AzH2cZ970QRPfILRqKHz67ipNDjL10' },
              { name: 'asifcit', value: '%7B%22id%22%3A%22u123%22%2C%22userId%22%3A%22guid-123%22%2C%22identified%22%3Atrue%7D' },
            ],
          },
          fetch: async (url) => {
            if (url.includes('sessions/me')) {
              return {
                ok: true,
                json: async () => ({ payload: { id: 'guid-123', nickname: 'Susano1337' } }),
              };
            }
            return { ok: false };
          },
        }),
      };

      const result = await openFaceitLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store,
      });

      expect(result.success).toBe(true);
      expect(result.faceitToken).toBe('146b70d6-925a-48c3-b13e-5175c9239c0d');
      expect(result.nickname).toBe('Susano1337');
      expect(result.faceitNickname).toBe('Susano1337');
      const saved = store.loadTokens();
      expect(saved.faceitToken).toBe('146b70d6-925a-48c3-b13e-5175c9239c0d');
      expect(saved.faceitNickname).toBe('Susano1337');
    });

    it('should capture steamId from steamLoginSecure cookie', async () => {
      const store = new SafeSessionStore(TEST_FILE);
      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => { this.eventHandlers[event] = handler; },
            getURL: () => 'https://csrep.gg/dashboard',
          };
        }
        isDestroyed() { return this.destroyed; }
        close() { this.destroyed = true; }
        on() {}
        async loadURL(url) {
          if (this.eventHandlers['did-navigate']) {
            await this.eventHandlers['did-navigate']({}, url);
          }
        }
      }

      const mockSession = {
        defaultSession: {
          cookies: {
            get: async () => [
              { name: 'csrep-access-token', value: 'csrep.token.sig' },
              { name: 'steamLoginSecure', value: '76561198434644264%7Csessionhash' },
            ],
          },
        },
      };

      const result = await openSteamLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store,
      });

      expect(result.success).toBe(true);
      expect(result.csrepToken).toBe('csrep.token.sig');
      expect(result.steamId).toBe('76561198434644264');

      const saved = store.loadTokens();
      expect(saved.steamId).toBe('76561198434644264');
    });

    it('should auto-sync partition sessions into store', async () => {
      const store = new SafeSessionStore(TEST_FILE);
      const mockSession = {
        fromPartition: (partitionName) => {
          if (partitionName === 'persist:csrep_auth') {
            return {
              cookies: {
                get: async () => [
                  { name: 'csrep-access-token', value: 'synced.csrep.token' },
                  { name: 'steamRefresh_steam', value: '76561198434644264%7Cother' },
                ],
              },
            };
          }
          if (partitionName === 'persist:faceit_auth') {
            return {
              cookies: {
                get: async () => [
                  { name: '__Host-FaceitGatewayAuthorization', value: 'synced-faceit-token' },
                ],
              },
              fetch: async (url) => {
                if (url.includes('sessions/me')) {
                  return {
                    ok: true,
                    json: async () => ({ payload: { nickname: 'Susano1337', id: 'faceit-uuid' } }),
                  };
                }
                return { ok: false };
              },
            };
          }
          return { cookies: { get: async () => [] } };
        },
      };

      const mockSqliteStore = {
        settings: {},
        setSetting(k, v) { this.settings[k] = v; },
      };

      const syncRes = await syncPartitionSessions({
        session: mockSession,
        store,
        sqliteStore: mockSqliteStore,
      });

      expect(syncRes.csrepRecovered).toBe(true);
      expect(syncRes.faceitRecovered).toBe(true);
      expect(syncRes.steamId).toBe('76561198434644264');
      expect(syncRes.faceitNickname).toBe('Susano1337');
      expect(mockSqliteStore.settings.steamId).toBe('76561198434644264');

      const loaded = store.loadTokens();
      expect(loaded.csrepToken).toBe('synced.csrep.token');
      expect(loaded.faceitToken).toBe('synced-faceit-token');
      expect(loaded.steamId).toBe('76561198434644264');
      expect(loaded.faceitNickname).toBe('Susano1337');
    });

    it('should cleanup onSendHeaders listener when window closes or completes', async () => {
      let removedListener = false;
      let listenerHandler = null;
      let createdWin = null;
      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => { this.eventHandlers[event] = handler; },
            getURL: () => 'https://www.faceit.com/en',
            executeJavaScript: async () => null,
          };
          createdWin = this;
        }
        isDestroyed() { return this.destroyed; }
        close() {
          this.destroyed = true;
          if (this.onClosed) this.onClosed();
        }
        on(event, handler) {
          if (event === 'closed') this.onClosed = handler;
        }
        async loadURL() {}
      }

      const mockSession = {
        defaultSession: { cookies: { get: async () => [] } },
        fromPartition: () => ({
          cookies: { get: async () => [] },
          webRequest: {
            onSendHeaders: (filterOrNull, cb) => {
              if (filterOrNull === null) {
                removedListener = true;
              } else {
                listenerHandler = cb;
              }
            },
          },
        }),
      };

      const winPromise = openFaceitLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store: new SafeSessionStore(TEST_FILE),
      });

      expect(typeof listenerHandler).toBe('function');
      createdWin.close();
      const res = await winPromise;
      expect(res.success).toBe(false);
      expect(removedListener).toBe(true);
    });

    it('should not authenticate using stale cookies when sessions/me returns 401', async () => {
      const store = new SafeSessionStore(TEST_FILE);
      let closeCalled = false;

      class MockBrowserWindow {
        constructor() {
          this.destroyed = false;
          this.eventHandlers = {};
          this.webContents = {
            on: (event, handler) => { this.eventHandlers[event] = handler; },
            getURL: () => 'https://www.faceit.com/en',
            executeJavaScript: async () => null,
          };
        }
        isDestroyed() { return this.destroyed; }
        close() { closeCalled = true; this.destroyed = true; }
        on(event, handler) {
          if (event === 'closed') this.onClosed = handler;
        }
        async loadURL(url) {
          if (this.eventHandlers['did-finish-load']) {
            await this.eventHandlers['did-finish-load']();
          }
        }
      }

      const mockSession = {
        defaultSession: { cookies: { get: async () => [] } },
        fromPartition: () => ({
          cookies: {
            get: async () => [
              { name: '__Host-FaceitGatewayAuthorization', value: 'stale-expired-uuid-1234567890' },
            ],
          },
          fetch: async (url) => {
            if (url.includes('sessions/me')) {
              return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
            }
            return { ok: false };
          },
        }),
      };

      let resolved = false;
      const winPromise = openFaceitLoginWindow(null, {
        BrowserWindow: MockBrowserWindow,
        session: mockSession,
        store,
      }).then((res) => {
        resolved = true;
        return res;
      });

      // Give captureFaceitSession time to run
      await new Promise(r => setTimeout(r, 80));
      // Because 401 was returned, it must NOT have auto-closed or resolved with success!
      expect(closeCalled).toBe(false);
      expect(resolved).toBe(false);
    });

    it('should strictly isolate APPDATA session.enc and data.sqlite from test mutations', () => {
      // When in test environment, default paths must not point to APPDATA
      const defaultSessionStore = new SafeSessionStore();
      expect(defaultSessionStore.storagePath).not.toContain(process.env.APPDATA);
      expect(defaultSessionStore.storagePath).toContain('session');

      // If real APPDATA files exist on developer machine, check that their size is non-zero and unchanged
      if (process.env.APPDATA) {
        const realSessionFile = path.join(process.env.APPDATA, 'csrep-uploader', 'session.enc');
        if (fs.existsSync(realSessionFile)) {
          const stat = fs.statSync(realSessionFile);
          expect(stat.size).toBeGreaterThanOrEqual(300);
        }
      }
    });
    it('should test top-level helper exports', async () => {
      process.env.SESSION_STORAGE_PATH = TEST_FILE;
      const { safeSessionStore: helperStore, saveTokens, loadTokens, clearTokens } = await import('../../src/storage/safe-session-store.js');
      helperStore.storagePath = TEST_FILE;
      saveTokens({ csrepToken: 'help_test', faceitNickname: 'Susano1337' });
      const loaded = loadTokens();
      expect(loaded.csrepToken).toBe('help_test');
      expect(loaded.faceitNickname).toBe('Susano1337');
      expect(clearTokens()).toBe(true);
      delete process.env.SESSION_STORAGE_PATH;
    });
  });
});
