import electron from 'electron';
const { ipcMain, shell } = electron;
import { openSteamLoginWindow, openFaceitLoginWindow, syncPartitionSessions } from './auth-window.js';

/**
 * Register all IPC handlers connecting frontend with SQLite, Auth, and Orchestrator
 *
 * @param {Object} context
 * @param {import('electron').BrowserWindow} context.mainWindow
 * @param {import('../storage/sqlite-store.js').SqliteStore} context.sqliteStore
 * @param {import('../storage/safe-session-store.js').SafeSessionStore} context.safeSessionStore
 * @param {import('../core/sync-orchestrator.js').SyncOrchestrator} [context.orchestrator]
 * @param {import('../core/state-store.js').AppStateStore} [context.stateStore]
 */
export function registerIpcHandlers({ mainWindow, sqliteStore, safeSessionStore, orchestrator, stateStore }) {
  // ── Matches & Stats ──
  async function syncMatchesFromCsrep() {
    try {
      const tokens = safeSessionStore.loadTokens();
      const steamId = tokens?.steamId || sqliteStore.getSetting('steamId', '') || '';
      if (!steamId) return;
      if (orchestrator?.csrepClient?.getAllMatchesDirect) {
        const matches = await orchestrator.csrepClient.getAllMatchesDirect(steamId, tokens?.csrepToken, 1);
        if (Array.isArray(matches) && matches.length > 0) {
          for (const m of matches) {
            sqliteStore.upsertMatch(m);
          }
        }
      }
    } catch (err) {
      console.warn('[IPC] syncMatchesFromCsrep error:', err.message);
    }
  }

  ipcMain.handle('matches:get-all', async () => {
    try {
      let matches = sqliteStore.getMatches();
      if (matches.length === 0) {
        await syncMatchesFromCsrep();
        matches = sqliteStore.getMatches();
      }
      return matches;
    } catch (err) {
      console.error('[IPC] matches:get-all error:', err);
      return [];
    }
  });

  ipcMain.handle('matches:get-stats', async () => {
    try {
      return sqliteStore.getStats();
    } catch (err) {
      console.error('[IPC] matches:get-stats error:', err);
      return { total: 0, uploaded: 0, missing: 0, failed: 0 };
    }
  });

  ipcMain.handle('matches:refresh', async () => {
    try {
      await syncMatchesFromCsrep();
      if (orchestrator && typeof orchestrator.scan === 'function') {
        const matches = await orchestrator.scan();
        if (Array.isArray(matches)) {
          for (const m of matches) {
            sqliteStore.upsertMatch(m);
          }
        }
      }
      return sqliteStore.getMatches();
    } catch (err) {
      console.error('[IPC] matches:refresh error:', err);
      return sqliteStore.getMatches();
    }
  });

  // ── Pipeline Upload Controls ──
  ipcMain.handle('pipeline:upload-match', async (_event, matchId) => {
    try {
      const getFn = sqliteStore.getMatchById || sqliteStore.getMatch;
      const rawMatch = getFn ? getFn.call(sqliteStore, matchId) : null;
      const target = {
        ...(rawMatch || {}),
        id: rawMatch?.id || matchId,
        csrepMatchId: rawMatch?.id || matchId,
        faceitMatchId: rawMatch?.faceit_id || rawMatch?.faceitMatchId || matchId,
        faceit_id: rawMatch?.faceit_id || rawMatch?.faceitMatchId || matchId,
      };
      sqliteStore.updateMatchStatus(matchId, 'uploading');
      mainWindow.webContents.send('match:updated', { id: matchId, status: 'uploading' });
      if (orchestrator && typeof orchestrator.uploadMatches === 'function') {
        orchestrator.uploadMatches([target]).catch((err) => {
          console.error('[IPC] pipeline:upload-match async error:', err?.message);
          sqliteStore.updateMatchStatus(matchId, 'failed', err?.message);
          mainWindow.webContents.send('match:updated', {
            id: matchId,
            status: 'failed',
            error: err?.message,
            error_message: err?.message,
          });
        });
      }
      return { success: true };
    } catch (err) {
      console.error('[IPC] pipeline:upload-match error:', err);
      sqliteStore.updateMatchStatus(matchId, 'failed', err.message);
      mainWindow.webContents.send('match:updated', { id: matchId, status: 'failed', error: err.message });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pipeline:pause-match', async (_event, matchId) => {
    try {
      if (orchestrator && typeof orchestrator.stop === 'function') {
        orchestrator.stop();
      }
      sqliteStore.updateMatchStatus(matchId, 'paused');
      mainWindow.webContents.send('match:updated', { id: matchId, status: 'paused' });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('pipeline:start-sync', async () => {
    try {
      const missing = sqliteStore.getMatches({ status: 'missing' });
      if (orchestrator && typeof orchestrator.uploadMatches === 'function' && missing.length > 0) {
        orchestrator.uploadMatches(missing);
      }
      return { success: true, count: missing.length };
    } catch (err) {
      console.error('[IPC] pipeline:start-sync error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Auth Handlers ──
  ipcMain.handle('auth:get-status', async () => {
    try {
      let tokens = safeSessionStore.loadTokens();
      // If tokens or metadata are missing, try auto-recovering from live partition sessions
      if (!tokens?.faceitToken || !tokens?.faceitNickname || !tokens?.csrepToken || !tokens?.steamId) {
        try {
          await syncPartitionSessions({ store: safeSessionStore, sqliteStore });
          tokens = safeSessionStore.loadTokens();
        } catch (syncErr) {
          console.warn('[IPC] syncPartitionSessions failed:', syncErr.message);
        }
      }
      const steamId = tokens?.steamId || sqliteStore.getSetting('steamId', '') || '';
      return {
        steamConnected: Boolean(tokens?.csrepToken),
        faceitConnected: Boolean(tokens?.faceitToken),
        steamId,
        faceitNickname: tokens?.faceitNickname || (tokens?.faceitToken ? 'CS2 Player' : ''),
        dpapiProtected: safeSessionStore.isEncryptionAvailable(),
      };
    } catch (err) {
      console.error('[IPC] auth:get-status error:', err);
      return {
        steamConnected: false,
        faceitConnected: false,
        steamId: '',
        faceitNickname: '',
        dpapiProtected: false,
      };
    }
  });

  ipcMain.handle('auth:login-steam', async () => {
    try {
      const result = await openSteamLoginWindow(mainWindow);
      if (result.success && result.steamId) {
        sqliteStore.setSetting('steamId', result.steamId);
      }
      return result;
    } catch (err) {
      console.error('[IPC] auth:login-steam error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:login-faceit', async () => {
    try {
      return await openFaceitLoginWindow(mainWindow);
    } catch (err) {
      console.error('[IPC] auth:login-faceit error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Settings ──
  ipcMain.handle('settings:get', async () => {
    try {
      return {
        steamId: sqliteStore.getSetting('steamId', ''),
        chunkConcurrency: Number(sqliteStore.getSetting('chunkConcurrency', '4')),
        autoSyncInterval: Number(sqliteStore.getSetting('autoSyncInterval', '15')),
      };
    } catch (err) {
      return {};
    }
  });

  ipcMain.handle('settings:save', async (_event, settings) => {
    try {
      if (settings.steamId !== undefined) sqliteStore.setSetting('steamId', String(settings.steamId));
      if (settings.chunkConcurrency !== undefined) sqliteStore.setSetting('chunkConcurrency', String(settings.chunkConcurrency));
      if (settings.autoSyncInterval !== undefined) sqliteStore.setSetting('autoSyncInterval', String(settings.autoSyncInterval));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Shell ──
  ipcMain.handle('shell:open-external', async (_event, url) => {
    try {
      if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Forward StateStore Events to Renderer ──
  if (stateStore && typeof stateStore.on === 'function') {
    stateStore.on('progress', (progressData) => {
      if (!mainWindow.isDestroyed()) {
        const payload = progressData.progress
          ? { ...progressData.progress, ...progressData }
          : progressData;
        mainWindow.webContents.send('pipeline:progress', payload);
      }
    });

    stateStore.on('matchUpdated', ({ id, status, error, statusText }) => {
      if (id) {
        const finalStatus = status === 'done' ? 'uploaded' : (status === 'active' ? 'uploading' : status);
        const errMsg = error || statusText;
        sqliteStore.updateMatchStatus(id, finalStatus, errMsg);
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('match:updated', {
            id,
            status: finalStatus,
            error: errMsg,
            error_message: errMsg,
          });
        }
      }
    });

    stateStore.on('log', (logEntry) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pipeline:log', logEntry);
      }
    });
  }
}
