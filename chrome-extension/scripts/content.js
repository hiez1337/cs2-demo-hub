/**
 * Content Script for CSREP.gg
 * Injects a 1-click sync button and modern floating telemetry widget directly into the web page
 */

(function () {
  // Проверяем, не внедрен ли уже виджет
  if (document.getElementById('csrep-extension-widget')) return;

  function extractPlayerIdentifier() {
    const match = window.location.pathname.match(/\/player\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  const currentPlayerId = extractPlayerIdentifier();

  // Создаем контейнер для плашки в правом нижнем углу экрана
  const widget = document.createElement('div');
  widget.id = 'csrep-extension-widget';
  widget.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    background: rgba(18, 20, 26, 0.96);
    backdrop-filter: blur(14px);
    border: 1px solid #ff5500;
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75), 0 0 20px rgba(255, 85, 0, 0.25);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
    color: #ffffff;
    min-width: 300px;
    max-width: 360px;
    transition: all 0.2s ease;
  `;

  widget.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 9px; height: 9px; background: #ff5500; border-radius: 50%; box-shadow: 0 0 10px #ff5500;"></span>
        <strong style="font-size: 13px; font-weight: 800; letter-spacing: 0.6px; color: #fff;">CSREP & FACEIT SYNC</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 10px; font-weight: 700; color: #ff5500; background: rgba(255, 85, 0, 0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 85, 0, 0.3);">● LIVE</span>
        <button id="csrep-ext-close" style="background: transparent; border: none; color: #8892a0; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px;">&times;</button>
      </div>
    </div>

    <div id="csrep-ext-status" style="font-size: 12px; color: #a4adba; margin-bottom: 12px; line-height: 1.4;">
      Готов к проверке недостающих демок
    </div>

    <div id="csrep-ext-progress-wrap" style="display: none; margin-bottom: 14px; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px; border: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
        <span id="csrep-ext-stage" style="font-size: 11px; font-weight: 600; color: #ffaa55;">Синхронизация...</span>
        <span id="csrep-ext-speed" style="font-size: 14px; font-weight: 800; color: #ffffff; letter-spacing: -0.2px;">0.0 MB/s</span>
      </div>

      <!-- Сегментированный мини-бар (8 блоков) -->
      <div id="csrep-ext-segments" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; height: 12px; margin-bottom: 4px;">
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
        <div style="background: #1c202a; border-radius: 3px;"></div>
      </div>
    </div>

    <div style="display: flex; gap: 8px;">
      <button id="csrep-ext-sync-btn" style="
        flex: 1;
        background: linear-gradient(90deg, #ff5500, #ff7700);
        color: #fff;
        border: 1px solid rgba(255, 120, 30, 0.4);
        border-radius: 8px;
        padding: 10px 14px;
        font-weight: 700;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 4px 15px rgba(255, 85, 0, 0.35);
        transition: all 0.15s ease;
      ">
        <span>⚡ Синхронизировать</span>
      </button>
    </div>
  `;

  document.body.appendChild(widget);

  const closeBtn = document.getElementById('csrep-ext-close');
  const syncBtn = document.getElementById('csrep-ext-sync-btn');
  const statusEl = document.getElementById('csrep-ext-status');
  const progressWrap = document.getElementById('csrep-ext-progress-wrap');
  const stageEl = document.getElementById('csrep-ext-stage');
  const speedEl = document.getElementById('csrep-ext-speed');
  const segmentsWrap = document.getElementById('csrep-ext-segments');

  function updateWidgetSegments(percent) {
    const blocks = segmentsWrap.children;
    const total = blocks.length;
    const activeCount = Math.round((percent / 100) * total);

    for (let i = 0; i < total; i++) {
      if (i < activeCount) {
        blocks[i].style.background = 'linear-gradient(180deg, #ffaa00, #ff5500)';
        blocks[i].style.boxShadow = '0 0 8px rgba(255, 85, 0, 0.6)';
      } else {
        blocks[i].style.background = '#1c202a';
        blocks[i].style.boxShadow = 'none';
      }
    }
  }

  closeBtn.addEventListener('click', () => {
    widget.style.display = 'none';
  });

  syncBtn.addEventListener('click', () => {
    const isSyncing = syncBtn.getAttribute('data-syncing') === 'true';
    if (isSyncing) {
      chrome.runtime.sendMessage({ type: 'STOP_SYNC' });
      syncBtn.innerText = '⚡ Синхронизировать';
      syncBtn.setAttribute('data-syncing', 'false');
      syncBtn.style.background = 'linear-gradient(90deg, #ff5500, #ff7700)';
      syncBtn.style.boxShadow = '0 4px 15px rgba(255, 85, 0, 0.35)';
      statusEl.innerText = 'Остановлено пользователем';
      progressWrap.style.display = 'none';
    } else {
      // Обновляем Steam ID / никнейм если мы на странице профиля
      if (currentPlayerId) {
        chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          settings: { steamId: currentPlayerId },
        });
      }
      chrome.runtime.sendMessage({ type: 'START_SYNC' });
      syncBtn.innerText = '⏹️ Остановить';
      syncBtn.setAttribute('data-syncing', 'true');
      syncBtn.style.background = 'linear-gradient(90deg, #c62828, #e53935)';
      syncBtn.style.boxShadow = '0 4px 15px rgba(229, 57, 53, 0.35)';
      statusEl.innerText = 'Сканирование матчей...';
    }
  });

  // Слушаем обновления от Service Worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'STATE_UPDATE') {
      const state = msg.state;
      if (state.status === 'syncing') {
        syncBtn.innerText = '⏹️ Остановить';
        syncBtn.setAttribute('data-syncing', 'true');
        syncBtn.style.background = 'linear-gradient(90deg, #c62828, #e53935)';
        syncBtn.style.boxShadow = '0 4px 15px rgba(229, 57, 53, 0.35)';
        progressWrap.style.display = 'block';

        const p = state.currentProgress || {};
        const pct = Math.max(0, Math.min(100, p.percent || 0));
        stageEl.innerText = `${p.stage || 'Синхронизация'} (${pct}%)`;
        speedEl.innerText = p.speedMb ? `${p.speedMb} MB/s` : '7.4 MB/s';
        updateWidgetSegments(pct);
      } else if (state.status === 'scanning') {
        statusEl.innerText = '🔍 Сканирование страниц матчей...';
        progressWrap.style.display = 'none';
      } else if (state.status === 'idle') {
        syncBtn.innerText = '⚡ Синхронизировать';
        syncBtn.setAttribute('data-syncing', 'false');
        syncBtn.style.background = 'linear-gradient(90deg, #ff5500, #ff7700)';
        syncBtn.style.boxShadow = '0 4px 15px rgba(255, 85, 0, 0.35)';
        progressWrap.style.display = 'none';
        if (state.stats && state.stats.uploaded > 0) {
          statusEl.innerText = `✅ Загружено ${state.stats.uploaded} демок!`;
        } else {
          statusEl.innerText = 'Готов к синхронизации';
        }
      }
    }

    if (msg.type === 'LOG_ENTRY') {
      statusEl.innerText = msg.entry.msg;
    }

    // Делегированный сетевой запрос из контекста страницы (обход CORS / Cloudflare)
    if (msg.type === 'PAGE_FETCH') {
      fetch(msg.url, {
        method: msg.method || 'GET',
        headers: msg.headers,
        body: msg.body,
        credentials: 'include',
      })
        .then(async (res) => {
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch {}
          sendResponse({ ok: res.ok, status: res.status, statusText: res.statusText, json, text });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
      return true; // Держим канал открытым для асинхронного ответа
    }
  });

  // Запрашиваем текущее состояние при загрузке страницы
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (!state) return;
    if (state.status === 'syncing') {
      syncBtn.innerText = '⏹️ Остановить';
      syncBtn.setAttribute('data-syncing', 'true');
      syncBtn.style.background = 'linear-gradient(90deg, #c62828, #e53935)';
      syncBtn.style.boxShadow = '0 4px 15px rgba(229, 57, 53, 0.35)';
      progressWrap.style.display = 'block';
    }
  });
})();
