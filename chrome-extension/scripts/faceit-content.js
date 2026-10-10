/**
 * Content Script for FACEIT.com
 * Injected into faceit.com to sign demo URLs natively using the user's active session
 */

(function () {
  console.log('[CSREP-Extension] FACEIT Content Script активен на странице:', window.location.href);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PING_FACEIT') {
      sendResponse({ ok: true, url: window.location.href });
      return true;
    }

    if (msg.type === 'SIGN_FACEIT_URL') {
      const targetUrl = msg.rawUrl;
      const endpoint = 'https://www.faceit.com/api/download/v2/demos/download-url';

      fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'faceit-referer': 'web-next',
        },
        body: JSON.stringify({ resource_url: targetUrl }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            sendResponse({ ok: false, status: res.status, error: errText });
            return;
          }
          const json = await res.json();
          const downloadUrl = json.payload?.download_url || null;
          sendResponse({ ok: !!downloadUrl, downloadUrl });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
      return true; // Держим канал открытым для асинхронного ответа
    }
  });
})();
