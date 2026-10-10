import { createRequire } from 'module';
import { safeSessionStore } from '../storage/safe-session-store.js';

const require = createRequire(import.meta.url);

function getElectronModules() {
  try {
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.BrowserWindow) {
      return electron;
    }
  } catch {}
  return null;
}

/**
 * Open Steam login window for CSREP authentication
 * Captures `csrep-access-token` cookie from csrep.gg
 *
 * @param {Object} [parentWindow] Electron parent BrowserWindow
 * @param {Object} [options] Optional configuration / test overrides
 * @returns {Promise<{ success: boolean, csrepToken?: string, steamId?: string|null, error?: string }>}
 */
export function openSteamLoginWindow(parentWindow = null, options = {}) {
  return new Promise(async (resolve, reject) => {
    const electron = getElectronModules();
    const BrowserWindowClass = options.BrowserWindow || electron?.BrowserWindow;
    const sessionObj = options.session || electron?.session;
    const store = options.store || safeSessionStore;

    if (!BrowserWindowClass || !sessionObj) {
      const err = new Error('Electron BrowserWindow or session is not available in current environment');
      return reject(err);
    }

    const win = new BrowserWindowClass({
      parent: parentWindow || undefined,
      modal: false,
      width: 900,
      height: 750,
      autoHideMenuBar: true,
      backgroundColor: '#11141d',
      webPreferences: {
        partition: 'persist:csrep_auth',
        contextIsolation: true,
        nodeIntegration: false,
      },
      ...options.windowOptions,
    });

    if (win.webContents?.setWindowOpenHandler) {
      try {
        win.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));
      } catch {}
    }

    let handled = false;
    let isChecking = false;

    const cleanup = () => {};

    const extractAndSaveCookie = async (currentUrl) => {
      if (handled || isChecking) return;
      isChecking = true;
      const urlStr = currentUrl || (win.webContents && (!win.isDestroyed || !win.isDestroyed()) && win.webContents.getURL ? win.webContents.getURL() : '');
      if (!urlStr || !urlStr.includes('csrep.gg')) {
        isChecking = false;
        return;
      }

      try {
        let cookies = [];

        // Calls session.defaultSession.cookies.get
        if (sessionObj.defaultSession?.cookies?.get) {
          try {
            const c1 = await sessionObj.defaultSession.cookies.get({ domain: 'csrep.gg' });
            const c2 = await sessionObj.defaultSession.cookies.get({});
            cookies = [...(c1 || []), ...(c2 || [])];
          } catch {}
        }

        // Also check partition session cookies if not found in defaultSession
        const partitionSession = sessionObj.fromPartition ? sessionObj.fromPartition('persist:csrep_auth') : null;
        if (partitionSession?.cookies?.get) {
          try {
            const c1 = await partitionSession.cookies.get({ domain: 'csrep.gg' });
            const c2 = await partitionSession.cookies.get({});
            cookies = [...cookies, ...(c1 || []), ...(c2 || [])];
          } catch {}
        }

        if (win.webContents?.session?.cookies?.get) {
          try {
            const c1 = await win.webContents.session.cookies.get({ domain: 'csrep.gg' });
            const c2 = await win.webContents.session.cookies.get({});
            cookies = [...cookies, ...(c1 || []), ...(c2 || [])];
          } catch {}
        }

        const tokenCookie = cookies?.find(c => c.name === 'csrep-access-token');
        if (tokenCookie && tokenCookie.value) {
          handled = true;
          let steamId = null;

          const steamCookie = cookies?.find(c => (c.name === 'steamLoginSecure' || c.name === 'steamRefresh_steam') && c.value);
          if (steamCookie && steamCookie.value) {
            const match = steamCookie.value.match(/^(\d{17})/);
            if (match) steamId = match[1];
          }

          if (!steamId) {
            try {
              const parts = tokenCookie.value.split('.');
              if (parts.length >= 2) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                steamId = payload.steamId || payload.sub || null;
              }
            } catch {}
          }

          const existing = store.loadTokens() || {};
          store.saveTokens({
            ...existing,
            csrepToken: tokenCookie.value,
            steamId: steamId || existing.steamId || null,
          });
          cleanup();
          setTimeout(() => {
            if (!win.isDestroyed || !win.isDestroyed()) {
              win.close();
            }
          }, 300);
          resolve({ success: true, csrepToken: tokenCookie.value, steamId });
        }
      } catch (err) {
        // Continue waiting on next navigation
      } finally {
        isChecking = false;
      }
    };

    if (win.webContents?.on) {
      win.webContents.on('did-navigate', (event, url) => extractAndSaveCookie(url));
      win.webContents.on('will-redirect', (event, url) => extractAndSaveCookie(url));
      win.webContents.on('did-finish-load', () => extractAndSaveCookie());
    }

    if (win.on) {
      win.on('closed', () => {
        cleanup();
        if (!handled) {
          resolve({ success: false, error: 'Window closed by user' });
        }
      });
    }

    try {
      const startUrl = options.url || 'https://csrep.gg/';
      if (win.loadURL) {
        await win.loadURL(startUrl);
      }
    } catch (loadErr) {
      if (!handled && (!win.isDestroyed || !win.isDestroyed())) {
        cleanup();
        win.close();
        resolve({ success: false, error: loadErr.message });
      }
    }
  });
}

/**
 * Open FACEIT login window and capture session token upon successful login
 *
 * @param {Object} [parentWindow] Electron parent BrowserWindow
 * @param {Object} [options] Optional configuration / test overrides
 * @returns {Promise<{ success: boolean, faceitToken?: string, error?: string }>}
 */
export function openFaceitLoginWindow(parentWindow = null, options = {}) {
  return new Promise(async (resolve, reject) => {
    const electron = getElectronModules();
    const BrowserWindowClass = options.BrowserWindow || electron?.BrowserWindow;
    const sessionObj = options.session || electron?.session;
    const store = options.store || safeSessionStore;

    if (!BrowserWindowClass || !sessionObj) {
      const err = new Error('Electron BrowserWindow or session is not available in current environment');
      return reject(err);
    }

    const win = new BrowserWindowClass({
      parent: parentWindow || undefined,
      modal: false,
      width: 1000,
      height: 800,
      autoHideMenuBar: true,
      backgroundColor: '#11141d',
      webPreferences: {
        partition: 'persist:faceit_auth',
        contextIsolation: true,
        nodeIntegration: false,
      },
      ...options.windowOptions,
    });

    if (win.webContents?.setWindowOpenHandler) {
      try {
        win.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));
      } catch {}
    }
    let handled = false;
    let isChecking = false;
    let networkBearerToken = null;
    let pollInterval = null;

    const partitionSession = sessionObj.fromPartition ? sessionObj.fromPartition('persist:faceit_auth') : null;
    let hasRegisteredSendHeaders = false;

    if (partitionSession?.webRequest?.onSendHeaders) {
      try {
        partitionSession.webRequest.onSendHeaders({ urls: ['*://*.faceit.com/*'] }, (details) => {
          try {
            const auth = details.requestHeaders?.['Authorization'] || details.requestHeaders?.['authorization'];
            if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
              const tok = auth.replace(/^Bearer\s+/i, '').trim();
              if (tok && tok.length >= 20) {
                networkBearerToken = tok;
              }
            }
          } catch {}
        });
        hasRegisteredSendHeaders = true;
      } catch {}
    }

    const cleanup = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (hasRegisteredSendHeaders && partitionSession?.webRequest?.onSendHeaders) {
        try {
          partitionSession.webRequest.onSendHeaders(null);
        } catch {}
        hasRegisteredSendHeaders = false;
      }
    };

    const captureFaceitSession = async (currentUrl) => {
      if (handled || isChecking) return;
      isChecking = true;
      const urlStr = currentUrl || (win.webContents && (!win.isDestroyed || !win.isDestroyed()) && win.webContents.getURL ? win.webContents.getURL() : '');

      try {
        let capturedToken = networkBearerToken || null;
        let capturedNickname = null;

        // 1. Check cookies on faceit.com from partition and default sessions
        let cookies = [];
        if (partitionSession?.cookies?.get) {
          try {
            const urlCookies = await partitionSession.cookies.get({ url: 'https://www.faceit.com' });
            const allCookies = await partitionSession.cookies.get({});
            cookies = [...(urlCookies || []), ...(allCookies || [])];
          } catch {}
        }
        if (sessionObj.defaultSession?.cookies?.get) {
          try {
            const urlCookies = await sessionObj.defaultSession.cookies.get({ url: 'https://www.faceit.com' });
            const allCookies = await sessionObj.defaultSession.cookies.get({});
            cookies = [...cookies, ...(urlCookies || []), ...(allCookies || [])];
          } catch {}
        }
        if (win.webContents?.session?.cookies?.get) {
          try {
            const urlCookies = await win.webContents.session.cookies.get({ url: 'https://www.faceit.com' });
            const allCookies = await win.webContents.session.cookies.get({});
            cookies = [...cookies, ...(urlCookies || []), ...(allCookies || [])];
          } catch {}
        }

        // Modern FACEIT cookies
        const gatewayCookie = cookies?.find(c => c.name === '__Host-FaceitGatewayAuthorization' && c.value);
        const authSessionCookie = cookies?.find(c => c.name === '__Host-AuthSession' && c.value);
        const asifcitCookie = cookies?.find(c => c.name === 'asifcit' && c.value);

        // Match genuine auth tokens or fallback cookies
        const validCookieNames = ['token', 'faceit_token', 'access_token', 'id_token', 'connect.sid'];
        const tokenCookie = cookies?.find(c =>
          validCookieNames.includes(c.name) && typeof c.value === 'string' && c.value.length >= 20
        );

        if (tokenCookie && tokenCookie.value) {
          capturedToken = capturedToken || tokenCookie.value;
        } else if (gatewayCookie && gatewayCookie.value) {
          capturedToken = capturedToken || gatewayCookie.value;
        } else if (authSessionCookie && authSessionCookie.value) {
          capturedToken = capturedToken || authSessionCookie.value;
        }

        let isProbeUnauthorized = false;
        // Probe sessions/me endpoint if partitionSession.fetch is available
        if (partitionSession && typeof partitionSession.fetch === 'function') {
          try {
            const probeRes = await partitionSession.fetch('https://www.faceit.com/api/users/v1/sessions/me', {
              headers: { 'Accept': 'application/json' },
            });
            if (probeRes.ok) {
              const probeData = await probeRes.json();
              if (probeData?.payload?.nickname) {
                capturedNickname = probeData.payload.nickname;
              }
              if (probeData?.payload?.id && !capturedToken) {
                capturedToken = probeData.payload.id;
              }
            } else if (probeRes.status === 401 || probeRes.status === 403) {
              isProbeUnauthorized = true;
            }
          } catch {}
        }

        if (isProbeUnauthorized) {
          capturedToken = null;
          capturedNickname = null;
        }

        // 2. Check localStorage / sessionStorage if page loaded and user is authenticated
        if (!win.isDestroyed || !win.isDestroyed()) {
          if (win.webContents && (!win.webContents.isDestroyed || !win.webContents.isDestroyed()) && win.webContents.executeJavaScript) {
            try {
              const res = await win.webContents.executeJavaScript(`
                (async () => {
                  try {
                    let token = localStorage.getItem('token') ||
                                localStorage.getItem('access_token') ||
                                localStorage.getItem('id_token') ||
                                sessionStorage.getItem('token') ||
                                null;
                    let nickname = null;

                    const userRaw = localStorage.getItem('user') || localStorage.getItem('profile');
                    if (userRaw) {
                      try {
                        const parsedUser = JSON.parse(userRaw);
                        nickname = parsedUser?.nickname || parsedUser?.guid || null;
                      } catch {}
                    }

                    const authRaw = localStorage.getItem('auth');
                    if (authRaw && !token) {
                      try {
                        const parsedAuth = JSON.parse(authRaw);
                        token = parsedAuth?.token || parsedAuth?.access_token || parsedAuth?.id_token || null;
                      } catch {}
                    }

                    if (!nickname) {
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (key.startsWith('__mpq') || key.includes('user') || key.includes('auth'))) {
                          try {
                            const val = JSON.parse(localStorage.getItem(key));
                            if (val?.username) nickname = val.username;
                            if (val?.nickname) nickname = val.nickname;
                          } catch {}
                        }
                      }
                    }

                    if (token || nickname) {
                      return { token, nickname };
                    }
                    return null;
                  } catch { return null; }
                })()
              `);

              if (res) {
                if (typeof res === 'string' && res.length >= 10) {
                  capturedToken = capturedToken || res;
                } else if (typeof res === 'object') {
                  if (res.token) capturedToken = capturedToken || res.token;
                  if (res.nickname) capturedNickname = capturedNickname || res.nickname;
                }
              }
            } catch {}
          }
        }

        if (!capturedToken && asifcitCookie?.value) {
          try {
            const parsedAsif = JSON.parse(decodeURIComponent(asifcitCookie.value));
            if (parsedAsif?.identified && parsedAsif?.userId) {
              capturedToken = parsedAsif.userId;
            }
          } catch {}
        }

        if (capturedToken) {
          handled = true;
          cleanup();
          const existing = store.loadTokens() || {};
          store.saveTokens({
            ...existing,
            faceitToken: capturedToken,
            faceitNickname: capturedNickname || existing.faceitNickname || null,
          });

          setTimeout(() => {
            if (!win.isDestroyed || !win.isDestroyed()) {
              win.close();
            }
          }, 300);
          resolve({
            success: true,
            faceitToken: capturedToken,
            nickname: capturedNickname,
            faceitNickname: capturedNickname,
          });
        }
      } catch (err) {
        // Wait for subsequent navigation / timer
      } finally {
        isChecking = false;
      }
    };

    pollInterval = setInterval(() => {
      if (!handled && (!win.isDestroyed || !win.isDestroyed())) {
        captureFaceitSession();
      }
    }, 1200);

    if (win.webContents?.on) {
      win.webContents.on('did-navigate', (event, url) => captureFaceitSession(url));
      win.webContents.on('did-navigate-in-page', (event, url) => captureFaceitSession(url));
      win.webContents.on('will-redirect', (event, url) => captureFaceitSession(url));
      win.webContents.on('did-finish-load', () => captureFaceitSession());
    }

    if (win.on) {
      win.on('closed', () => {
        cleanup();
        if (!handled) {
          resolve({ success: false, error: 'Window closed by user' });
        }
      });
    }

    try {
      const startUrl = options.url || 'https://www.faceit.com/en';
      if (win.loadURL) {
        await win.loadURL(startUrl);
      }
    } catch (loadErr) {
      if (!handled && (!win.isDestroyed || !win.isDestroyed())) {
        cleanup();
        win.close();
        resolve({ success: false, error: loadErr.message });
      }
    }
  });
}

/**
 * Auto-sync existing partition sessions (CSREP and FACEIT) into SafeSessionStore
 *
 * @param {Object} [options]
 * @param {Object} [options.session]
 * @param {Object} [options.store]
 * @param {Object} [options.sqliteStore]
 * @returns {Promise<{ faceitRecovered: boolean, csrepRecovered: boolean, faceitNickname?: string|null, steamId?: string|null, faceitToken?: string|null, csrepToken?: string|null }>}
 */
export async function syncPartitionSessions(options = {}) {
  const electron = getElectronModules();
  const sessionObj = options.session || electron?.session;
  const store = options.store || safeSessionStore;
  const sqliteStore = options.sqliteStore || null;

  if (!sessionObj?.fromPartition) {
    return { faceitRecovered: false, csrepRecovered: false };
  }

  const existing = store.loadTokens() || {};
  let updated = { ...existing };
  let faceitRecovered = false;
  let csrepRecovered = false;

  // 1. Recover CSREP / Steam session from persist:csrep_auth
  try {
    const csrepSes = sessionObj.fromPartition('persist:csrep_auth');
    if (csrepSes?.cookies?.get) {
      const cookies = await csrepSes.cookies.get({});
      const csrepCookie = cookies?.find(c => c.name === 'csrep-access-token');
      if (csrepCookie?.value && (!updated.csrepToken || updated.csrepToken !== csrepCookie.value)) {
        updated.csrepToken = csrepCookie.value;
        csrepRecovered = true;
      }

      const steamCookie = cookies?.find(c => (c.name === 'steamLoginSecure' || c.name === 'steamRefresh_steam') && c.value);
      if (steamCookie?.value) {
        const match = steamCookie.value.match(/^(\d{17})/);
        if (match && (!updated.steamId || updated.steamId !== match[1])) {
          updated.steamId = match[1];
          if (sqliteStore && typeof sqliteStore.setSetting === 'function') {
            sqliteStore.setSetting('steamId', match[1]);
          }
          csrepRecovered = true;
        }
      }
    }
  } catch (err) {
    // non-fatal
  }

  // 2. Recover FACEIT session from persist:faceit_auth
  try {
    const faceitSes = sessionObj.fromPartition('persist:faceit_auth');
    if (faceitSes?.cookies?.get) {
      const urlCookies = await faceitSes.cookies.get({ url: 'https://www.faceit.com' });
      const allCookies = await faceitSes.cookies.get({});
      const cookies = [...(urlCookies || []), ...(allCookies || [])];

      const gatewayCookie = cookies?.find(c => c.name === '__Host-FaceitGatewayAuthorization' && c.value);
      const authSessionCookie = cookies?.find(c => c.name === '__Host-AuthSession' && c.value);
      const asifcitCookie = cookies?.find(c => c.name === 'asifcit' && c.value);

      let faceitNickname = updated.faceitNickname || null;
      let faceitToken = updated.faceitToken || gatewayCookie?.value || authSessionCookie?.value || null;

      if (faceitSes.fetch) {
        try {
          const res = await faceitSes.fetch('https://www.faceit.com/api/users/v1/sessions/me', {
            headers: { 'Accept': 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.payload?.nickname) {
              faceitNickname = data.payload.nickname;
            }
            if (data?.payload?.id && !faceitToken) {
              faceitToken = data.payload.id;
            }
          } else if (res.status === 401 || res.status === 403) {
            faceitToken = null;
            faceitNickname = null;
          }
        } catch {}
      }

      if (!faceitToken && asifcitCookie?.value) {
        try {
          const parsedAsif = JSON.parse(decodeURIComponent(asifcitCookie.value));
          if (parsedAsif?.userId) {
            faceitToken = parsedAsif.userId;
          }
        } catch {}
      }

      if (faceitToken || faceitNickname) {
        if (faceitToken) updated.faceitToken = faceitToken;
        if (faceitNickname) updated.faceitNickname = faceitNickname;
        faceitRecovered = true;
      }
    }
  } catch (err) {
    // non-fatal
  }

  if (faceitRecovered || csrepRecovered) {
    store.saveTokens(updated);
  }

  return {
    faceitRecovered,
    csrepRecovered,
    faceitNickname: updated.faceitNickname,
    steamId: updated.steamId,
    faceitToken: updated.faceitToken,
    csrepToken: updated.csrepToken,
  };
}

export default {
  openSteamLoginWindow,
  openFaceitLoginWindow,
  syncPartitionSessions,
};
