// ============================================
// CSREP.GG API SNIFFER
// ============================================
// Вставь этот скрипт в консоль DevTools (F12)
// на странице https://csrep.gg/player/76561198434644264
// Затем:
//   1. Перезагрузи страницу (F5)
//   2. Перейди на вкладку Matches
//   3. Нажми на любой матч с "DEMO MISSING"
//   4. Когда закончишь — нажми кнопку "📋 Copy Results" (появится вверху справа)
//   5. Вставь результат мне в чат
// ============================================

(function() {
  const captured = [];
  
  // Перехват fetch
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const opts = args[1] || {};
    const method = opts.method || 'GET';
    
    const entry = {
      type: 'fetch',
      method: method,
      url: url,
      headers: {},
      body: null,
      timestamp: new Date().toISOString()
    };
    
    // Capture headers
    if (opts.headers) {
      if (opts.headers instanceof Headers) {
        opts.headers.forEach((v, k) => entry.headers[k] = v);
      } else {
        entry.headers = { ...opts.headers };
      }
    }
    
    // Capture body
    if (opts.body) {
      if (opts.body instanceof FormData) {
        entry.body = '[FormData]';
        entry.formDataKeys = [];
        for (const [key, val] of opts.body.entries()) {
          entry.formDataKeys.push({
            key: key,
            value: val instanceof File ? `[File: ${val.name}, ${val.size} bytes, ${val.type}]` : String(val).substring(0, 200)
          });
        }
      } else if (typeof opts.body === 'string') {
        try { entry.body = JSON.parse(opts.body); } catch { entry.body = opts.body.substring(0, 500); }
      }
    }
    
    const response = await origFetch.apply(this, args);
    entry.status = response.status;
    
    // Clone and read response for API calls
    if (url.includes('api') || url.includes('match') || url.includes('demo') || url.includes('player') || url.includes('upload')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        try { entry.response = JSON.parse(text); } catch { entry.response = text.substring(0, 1000); }
      } catch {}
    }
    
    captured.push(entry);
    console.log(`%c[SNIFFER] ${method} ${url} -> ${response.status}`, 'color: #4CAF50; font-weight: bold');
    
    return response;
  };
  
  // Перехват XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._sniff = { type: 'xhr', method, url, timestamp: new Date().toISOString() };
    return origOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.send = function(body) {
    if (this._sniff) {
      if (body instanceof FormData) {
        this._sniff.body = '[FormData]';
        this._sniff.formDataKeys = [];
        for (const [key, val] of body.entries()) {
          this._sniff.formDataKeys.push({
            key,
            value: val instanceof File ? `[File: ${val.name}, ${val.size}b, ${val.type}]` : String(val).substring(0, 200)
          });
        }
      } else if (body) {
        try { this._sniff.body = JSON.parse(body); } catch { this._sniff.body = String(body).substring(0, 500); }
      }
      
      this.addEventListener('load', () => {
        this._sniff.status = this.status;
        const url = this._sniff.url;
        if (url.includes('api') || url.includes('match') || url.includes('demo') || url.includes('player') || url.includes('upload')) {
          try { this._sniff.response = JSON.parse(this.responseText); } catch { this._sniff.response = this.responseText?.substring(0, 1000); }
        }
        captured.push(this._sniff);
        console.log(`%c[SNIFFER-XHR] ${this._sniff.method} ${url} -> ${this.status}`, 'color: #FF9800; font-weight: bold');
      });
    }
    return origSend.apply(this, arguments);
  };
  
  // Кнопка для копирования результатов
  const btn = document.createElement('button');
  btn.textContent = 'Copy API Results';
  btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;padding:12px 20px;background:#4CAF50;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  btn.onclick = () => {
    // Filter only interesting requests
    const interesting = captured.filter(e => {
      const url = e.url || '';
      return url.includes('api') || url.includes('match') || url.includes('demo') || 
             url.includes('player') || url.includes('upload') || url.includes('graphql') ||
             url.includes('csrep');
    });
    
    const result = {
      total_captured: captured.length,
      interesting_requests: interesting,
      all_urls: captured.map(e => `${e.method} ${e.url} -> ${e.status}`),
      cookies: document.cookie
    };
    
    const text = JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.style.background = '#2196F3';
      setTimeout(() => { btn.textContent = 'Copy API Results'; btn.style.background = '#4CAF50'; }, 2000);
    });
    
    console.log('%c=== CAPTURED API REQUESTS ===', 'color: #E91E63; font-size: 16px');
    console.log(result);
  };
  document.body.appendChild(btn);
  
  console.log('%cCSREP API Sniffer activated!', 'color: #E91E63; font-size: 20px; font-weight: bold');
  console.log('%cТеперь:', 'color: white; font-size: 14px');
  console.log('%c  1. Перезагрузи страницу (F5)', 'color: #4CAF50; font-size: 13px');
  console.log('%c  2. Перейди на Matches', 'color: #4CAF50; font-size: 13px');
  console.log('%c  3. Открой матч с DEMO MISSING', 'color: #4CAF50; font-size: 13px');
  console.log('%c  4. Нажми зелёную кнопку "Copy API Results" вверху справа', 'color: #4CAF50; font-size: 13px');
  console.log('%c  5. Вставь результат мне в чат', 'color: #4CAF50; font-size: 13px');
})();
