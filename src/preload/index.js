import electron from 'electron';
const { contextBridge, ipcRenderer } = electron;

const apiMethods = {
  // Matches & Data
  getMatches: () => ipcRenderer.invoke('matches:get-all'),
  getStats: () => ipcRenderer.invoke('matches:get-stats'),
  refreshMatches: () => ipcRenderer.invoke('matches:refresh'),
  uploadMatch: (matchId) => ipcRenderer.invoke('pipeline:upload-match', matchId),
  pauseUpload: (matchId) => ipcRenderer.invoke('pipeline:pause-match', matchId),
  startSync: () => ipcRenderer.invoke('pipeline:start-sync'),

  // Auth
  getAuth: () => ipcRenderer.invoke('auth:get-status'),
  getAuthStatus: () => ipcRenderer.invoke('auth:get-status'),
  openSteamLogin: () => ipcRenderer.invoke('auth:login-steam'),
  loginSteam: () => ipcRenderer.invoke('auth:login-steam'),
  openFaceitLogin: () => ipcRenderer.invoke('auth:login-faceit'),
  loginFaceit: () => ipcRenderer.invoke('auth:login-faceit'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // External Links
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Event Listeners
  onMatchUpdated: (callback) => {
    const handler = (_event, match) => callback(match);
    ipcRenderer.on('match:updated', handler);
    return () => ipcRenderer.removeListener('match:updated', handler);
  },
  onUploadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('pipeline:progress', handler);
    return () => ipcRenderer.removeListener('pipeline:progress', handler);
  },
  onLog: (callback) => {
    const handler = (_event, log) => callback(log);
    ipcRenderer.on('pipeline:log', handler);
    return () => ipcRenderer.removeListener('pipeline:log', handler);
  },
};

contextBridge.exposeInMainWorld('api', apiMethods);
contextBridge.exposeInMainWorld('electronAPI', apiMethods);
