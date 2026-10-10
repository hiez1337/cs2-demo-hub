import electron from 'electron';
const { app, BrowserWindow, session, Tray, Menu } = electron;
import path from 'path';
import { fileURLToPath } from 'url';
import { SqliteStore } from '../storage/sqlite-store.js';
import { safeSessionStore } from '../storage/safe-session-store.js';
import { registerIpcHandlers } from './ipc-router.js';
import { SyncOrchestrator } from '../core/sync-orchestrator.js';
import { AppStateStore } from '../core/state-store.js';
import { ConfigManager } from '../config/index.js';
import { FaceitApiClient } from '../api/faceit/client.js';
import { FaceitDownloader } from '../api/faceit/downloader.js';
import { CsrepClient } from '../api/csrep/client.js';
import { CsrepUploader } from '../api/csrep/uploader.js';
import { ChunkWorkerPool } from '../core/chunk-worker-pool.js';

// Suppress noisy Chromium STUN and web advertisement logs
app.commandLine.appendSwitch('log-level', '3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let signerWindow = null;
let csrepSignerWindow = null;
let tray = null;
let sqliteStore = null;
async function getOrCreateSignerWindow() {
  if (signerWindow && !signerWindow.isDestroyed()) {
    return signerWindow;
  }
  signerWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      partition: 'persist:faceit_auth',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    const nav = signerWindow.loadURL('https://www.faceit.com/en');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    await Promise.race([nav, timeout]);
  } catch {
    // Ignore navigation errors or timeout
  }
  return signerWindow;
}

async function signDemoUrl(rawDemoUrl, faceitToken) {
  try {
    const win = await getOrCreateSignerWindow();
    if (!win || win.isDestroyed()) return null;
    return await win.webContents.executeJavaScript(`
      (async (rawUrl, token) => {
        try {
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'faceit-referer': 'web-next',
          };
          if (token) {
            headers['Authorization'] = 'Bearer ' + token;
          }
          const res = await fetch('https://www.faceit.com/api/download/v2/demos/download-url', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ resource_url: rawUrl }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data?.payload?.download_url || null;
        } catch {
          return null;
        }
      })(${JSON.stringify(rawDemoUrl)}, ${JSON.stringify(faceitToken || '')})
    `);
  } catch (err) {
    console.warn('[FaceitSigner] Failed to sign demo URL via browser context:', err.message);
    return null;
  }
}
async function getOrCreateCsrepSignerWindow() {
  if (csrepSignerWindow && !csrepSignerWindow.isDestroyed()) {
    return csrepSignerWindow;
  }
  csrepSignerWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      partition: 'persist:csrep_auth',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    const nav = csrepSignerWindow.loadURL('https://csrep.gg/');
    const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
    await Promise.race([nav, timeout]);
  } catch {
    // Ignore navigation errors
  }
  return csrepSignerWindow;
}

async function evaluateInCsrep(fn, args) {
  try {
    const win = await getOrCreateCsrepSignerWindow();
    if (!win || win.isDestroyed()) {
      throw new Error('Окно сессии CSREP недоступно');
    }
    const code = `(${fn.toString()})(${JSON.stringify(args || {})})`;
    return await win.webContents.executeJavaScript(code);
  } catch (err) {
    console.warn('[CsrepSigner] Evaluation error:', err.message);
    throw err;
  }
}

async function createWindow() {
  try {
    sqliteStore = new SqliteStore();

    const configManager = new ConfigManager();
    const config = configManager.get();
    const stateStore = new AppStateStore(config, { has: (id) => sqliteStore.hasMatch(id) });
    const faceitSes = session ? session.fromPartition('persist:faceit_auth') : null;
    const faceitApiClient = new FaceitApiClient(config.faceitApiKey, {
      fetch: faceitSes?.fetch ? faceitSes.fetch.bind(faceitSes) : null,
    });
    const faceitDownloader = new FaceitDownloader(faceitApiClient, './demos_temp', config.chunkConcurrency || 6, {
      signUrlFn: signDemoUrl,
    });
    const csrepClient = new CsrepClient({ evaluateFn: evaluateInCsrep });
    const csrepUploader = new CsrepUploader({ evaluateFn: evaluateInCsrep });
    const chunkWorkerPool = new ChunkWorkerPool({ concurrency: config.chunkConcurrency });
    const orchestrator = new SyncOrchestrator({
      config,
      stateStore,
      browserManager: null,
      faceitApiClient,
      faceitDownloader,
      csrepClient,
      csrepUploader,
      historyStore: {
        has: (id) => sqliteStore.hasMatch(id),
        add: (id) => {
          sqliteStore.updateMatchStatus(id, 'uploaded');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('match:updated', { id, status: 'uploaded' });
          }
        },
        updateStatus: (id, status, error = null) => {
          sqliteStore.updateMatchStatus(id, status, error);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('match:updated', {
              id,
              status,
              error,
              error_message: error,
            });
          }
        },
        save: () => {},
      },
      chunkWorkerPool,
      sessionStore: safeSessionStore,
    });

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 780,
      minWidth: 880,
      minHeight: 560,
      backgroundColor: '#090b10',
      title: 'CS2 Demo Hub — CSREP & FACEIT Uploader',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    registerIpcHandlers({
      mainWindow,
      sqliteStore,
      safeSessionStore,
      orchestrator,
      stateStore,
    });
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    const prodPath = path.join(__dirname, '../../dist/renderer/index.html');

    if (isDev) {
      try {
        await mainWindow.loadURL('http://localhost:5173');
      } catch {
        await mainWindow.loadFile(prodPath);
      }
    } else {
      await mainWindow.loadFile(prodPath);
    }
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    console.error('[Main] Failed to initialize window and orchestrator:', err);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (signerWindow && !signerWindow.isDestroyed()) {
    try { signerWindow.destroy(); } catch {}
    signerWindow = null;
  }
  if (csrepSignerWindow && !csrepSignerWindow.isDestroyed()) {
    try { csrepSignerWindow.destroy(); } catch {}
    csrepSignerWindow = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
