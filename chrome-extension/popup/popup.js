/**
 * Popup Script for CSREP & FACEIT Demo Uploader Pro
 * Controls UI states, segmented chunk progress bar, real-time speed, and settings
 */

const steamIdInput = document.getElementById('steamId');
const maxPagesSelect = document.getElementById('maxPages');
const concurrencySelect = document.getElementById('concurrency');
const faceitApiKeyInput = document.getElementById('faceitApiKey');

const settingsCard = document.getElementById('settingsCard');
const paramSummaryBar = document.getElementById('paramSummaryBar');
const summaryPages = document.getElementById('summaryPages');
const summaryThreads = document.getElementById('summaryThreads');
const summarySteamId = document.getElementById('summarySteamId');

const syncBtn = document.getElementById('syncBtn');
const progressCard = document.getElementById('progressCard');
const stageLabel = document.getElementById('stageLabel');
const percentBadge = document.getElementById('percentBadge');
const speedVal = document.getElementById('speedVal');
const progressDetail = document.getElementById('progressDetail');
const segmentedBar = document.getElementById('segmentedBar');

const statUploaded = document.getElementById('statUploaded');
const statSkipped = document.getElementById('statSkipped');
const statFailed = document.getElementById('statFailed');

const terminalLogs = document.getElementById('terminalLogs');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

let currentStatus = 'idle';

// 1. Инициализация и получение начального состояния
async function init() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (!state) return;
      renderState(state);

      steamIdInput.value = state.steamId || '76561198434644264';
      faceitApiKeyInput.value = state.faceitApiKey || '';
      maxPagesSelect.value = String(state.maxPages || 3);
      concurrencySelect.value = String(state.concurrency || 4);

      if (state.logs && state.logs.length > 0) {
        terminalLogs.innerHTML = '';
        state.logs.forEach(addLogLine);
      }
    });
  } else {
    // Standalone / Preview Mode
    renderState({
      status: 'idle',
      steamId: '76561198434644264',
      maxPages: 3,
      concurrency: 4,
      faceitApiKey: '',
      stats: { uploaded: 0, skipped: 0, failed: 0 },
      logs: [
        { time: '03:00:00', msg: 'Расширение готово к работе', level: 'info' },
        { time: '03:00:01', msg: 'Расширение готово', level: 'info' },
        { time: '03:00:02', msg: 'Расширение демки', level: 'info' }
      ]
    });
  }
}

// 2. Отображение состояния интерфейса
export function renderState(state) {
  if (!state) return;
  currentStatus = state.status || 'idle';

  // Обновляем плашку текущих параметров
  const sId = state.steamId || steamIdInput.value || '76561198434644264';
  if (summaryPages) summaryPages.innerText = state.maxPages || (maxPagesSelect ? maxPagesSelect.value : 3);
  if (summaryThreads) summaryThreads.innerText = state.concurrency || (concurrencySelect ? concurrencySelect.value : 4);
  if (summarySteamId) summarySteamId.innerText = sId.length > 8 ? `${sId.slice(0, 4)}...${sId.slice(-4)}` : sId;

  if (state.status === 'syncing' || state.status === 'scanning') {
    // В активном режиме: скрываем форму настроек, показываем телеметрию и сводку параметров
    if (settingsCard) settingsCard.style.display = 'none';
    if (paramSummaryBar) paramSummaryBar.style.display = 'flex';
    if (progressCard) progressCard.style.display = 'flex';

    if (syncBtn) {
      syncBtn.innerHTML = '<span style="display:inline-block;width:9px;height:9px;background:#ff5500;border-radius:2px;margin-right:8px;box-shadow:0 0 8px #ff5500;"></span><span>Остановить синхронизацию</span>';
      syncBtn.classList.add('btn-stop');
    }

    const p = state.currentProgress || {};
    const percent = Math.max(0, Math.min(100, p.percent || 0));

    if (stageLabel) stageLabel.innerText = p.stage || (state.status === 'scanning' ? 'Сканирование страниц csrep.gg' : 'Загрузка в Cloudflare R2');
    if (percentBadge) percentBadge.innerText = `${percent}%`;

    const sp = parseFloat(p.speedMb) || 0;
    if (speedVal) speedVal.innerText = sp > 0 ? sp.toFixed(1) : (state.status === 'scanning' ? '0.0' : '7.4');

    if (progressDetail) progressDetail.innerText = p.detail || (state.status === 'scanning' ? 'Опрос API страниц...' : '108.4 / 158.0 MB (Part 8/16)');

    // Обновляем сегментированный прогресс-бар
    updateSegmentedBar(percent);
  } else {
    // В режиме ожидания: возвращаем карточку настроек
    if (settingsCard) settingsCard.style.display = 'flex';
    if (paramSummaryBar) paramSummaryBar.style.display = 'none';
    if (progressCard) progressCard.style.display = 'none';

    if (syncBtn) {
      syncBtn.innerHTML = '<span>⚡ Синхронизировать демки</span>';
      syncBtn.classList.remove('btn-stop');
    }
  }

  // Обновление счетчиков статистики
  if (state.stats) {
    if (statUploaded) statUploaded.innerText = state.stats.uploaded || 0;
    if (statSkipped) statSkipped.innerText = state.stats.skipped || 0;
    if (statFailed) statFailed.innerText = state.stats.failed || 0;
  }

  // Логи
  if (state.logs && state.logs.length > 0 && terminalLogs) {
    terminalLogs.innerHTML = '';
    state.logs.forEach(addLogLine);
  }
}

// 3. Заполнение сегментов светящегося прогресс-бара
function updateSegmentedBar(percent) {
  if (!segmentedBar) return;
  const segments = segmentedBar.querySelectorAll('.segment');
  const total = segments.length;
  const activeCount = Math.round((percent / 100) * total);

  segments.forEach((seg, idx) => {
    seg.classList.remove('active', 'lead');
    if (idx < activeCount) {
      seg.classList.add('active');
      if (idx === activeCount - 1 && percent < 100) {
        seg.classList.add('lead');
      }
    }
  });
}

// 4. Добавление записи в терминал
export function addLogLine(entry) {
  if (!terminalLogs) return;
  const line = document.createElement('div');
  line.className = `log-line ${entry.level || 'info'}`;
  line.innerText = `[${entry.time}] ${entry.msg}`;
  terminalLogs.appendChild(line);
  terminalLogs.scrollTop = terminalLogs.scrollHeight;
}

// 5. Обработчики действий
if (syncBtn) {
  syncBtn.addEventListener('click', () => {
    if (currentStatus === 'syncing' || currentStatus === 'scanning') {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'STOP_SYNC' });
      } else {
        renderState({ status: 'idle' });
      }
    } else {
      saveSettings();
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'START_SYNC' });
      } else {
        renderState({
          status: 'syncing',
          currentProgress: {
            stage: 'Загрузка в Cloudflare R2 (68%)',
            percent: 68,
            speedMb: '7.4',
            detail: '108.4 / 158.0 MB (Part 8/16)'
          },
          stats: { uploaded: 3, skipped: 0, failed: 0 },
          logs: [
            { time: '03:04:12', msg: '📥 Скачивание демо', level: 'success' },
            { time: '03:04:12', msg: '📥 Скачивание демо', level: 'success' },
            { time: '03:04:28', msg: '🚀 Отправка в R2', level: 'warn' },
            { time: '03:04:28', msg: '🚀 Отправка в R2', level: 'warn' }
          ]
        });
      }
    }
  });
}

function saveSettings() {
  const settings = {
    steamId: steamIdInput?.value.trim() || '76561198434644264',
    faceitApiKey: faceitApiKeyInput?.value.trim() || '',
    maxPages: parseInt(maxPagesSelect?.value || 3, 10),
    concurrency: parseInt(concurrencySelect?.value || 4, 10),
  };
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  }
}

if (steamIdInput) steamIdInput.addEventListener('change', saveSettings);
if (faceitApiKeyInput) faceitApiKeyInput.addEventListener('change', saveSettings);
if (maxPagesSelect) maxPagesSelect.addEventListener('change', saveSettings);
if (concurrencySelect) concurrencySelect.addEventListener('change', saveSettings);

if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', () => {
    if (terminalLogs) terminalLogs.innerHTML = '<div class="log-line info">[—:—:—] Журнал очищен</div>';
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ logs: [] });
    }
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Сбросить историю ранее загруженных матчей?')) {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
      }
    }
  });
}

// 6. Слушатель обновлений от Service Worker
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATE_UPDATE') {
      renderState(msg.state);
    }
    if (msg.type === 'LOG_ENTRY') {
      addLogLine(msg.entry);
    }
  });
}

// Expose preview helper on window for visual renderer
if (typeof window !== 'undefined') {
  window.renderPreviewState = renderState;
  window.addPreviewLog = addLogLine;
}

init();
