import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
  constructor(port = 3333, host = '127.0.0.1', stateStore, orchestrator) {
    this.port = port;
    this.host = host;
    this.stateStore = stateStore;
    this.orchestrator = orchestrator;
    this.sseClients = new Set();
    this.server = null;

    // Подписка на события хранилища для рассылки клиентам SSE
    this.stateStore.on('log', (entry) => this.broadcast({ type: 'log', ...entry }));
    this.stateStore.on('matches_found', (data) => this.broadcast({ type: 'matches_found', ...data }));
    this.stateStore.on('progress', (data) => this.broadcast({ type: 'progress', ...data }));
    this.stateStore.on('stats', (data) => this.broadcast({ type: 'stats', ...data }));
    this.stateStore.on('state', (data) => this.broadcast({ type: 'state', ...data }));
  }

  broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  resolveHtmlPath() {
    const candidates = [
      path.resolve('./public/index.html'),
      path.resolve(__dirname, '../../public/index.html'),
      path.resolve(__dirname, '../public/index.html'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  start() {
    const htmlPath = this.resolveHtmlPath();

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

      // 1. Статика (index.html)
      if (url.pathname === '/' || url.pathname === '/index.html') {
        if (fs.existsSync(htmlPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(htmlPath).pipe(res);
          return;
        }
      }

      // 2. SSE поток событий (EventStream)
      if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('\n');
        this.sseClients.add(res);
        req.on('close', () => this.sseClients.delete(res));

        // Мгновенная гидратация состояния
        res.write(`data: ${JSON.stringify({
          type: 'init',
          state: this.stateStore.getSnapshot(),
        })}\n\n`);
        return;
      }

      // 3. REST: Получение состояния
      if (url.pathname === '/api/state' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.stateStore.getSnapshot()));
        return;
      }

      // 4. REST: POST команды (с лимитом размера тела 1MB)
      if (req.method === 'POST') {
        let bodyStr = '';
        let bodySize = 0;
        const MAX_BODY = 1024 * 1024; // 1MB

        req.on('data', chunk => {
          bodySize += chunk.length;
          if (bodySize > MAX_BODY) {
            req.destroy();
            return;
          }
          bodyStr += chunk;
        });

        req.on('end', async () => {
          let payload = {};
          try { payload = JSON.parse(bodyStr); } catch {}

          res.writeHead(200, { 'Content-Type': 'application/json' });

          if (url.pathname === '/api/scan') {
            res.end(JSON.stringify({ ok: true }));
            this.orchestrator.scan(payload.pages).catch(console.error);
            return;
          }

          if (url.pathname === '/api/start') {
            res.end(JSON.stringify({ ok: true }));
            let targetMatches = this.stateStore.state.matches;

            if (payload.matchIds && Array.isArray(payload.matchIds) && payload.matchIds.length > 0) {
              targetMatches = this.stateStore.state.matches.filter(m => payload.matchIds.includes(m.csrepMatchId));
            } else if (targetMatches.length === 0) {
              targetMatches = await this.orchestrator.scan(payload.pages);
            }

            if (targetMatches.length > 0) {
              this.orchestrator.uploadMatches(targetMatches).catch(console.error);
            }
            return;
          }

          if (url.pathname === '/api/upload-single') {
            res.end(JSON.stringify({ ok: true }));
            const single = this.stateStore.state.matches.filter(m => m.csrepMatchId === payload.matchId);
            if (single.length > 0) {
              this.orchestrator.uploadMatches(single).catch(console.error);
            }
            return;
          }

          if (url.pathname === '/api/stop') {
            res.end(JSON.stringify({ ok: true }));
            this.orchestrator.stop();
            return;
          }

          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Unknown endpoint' }));
        });
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`🌐 Web Studio доступна по адресу: http://${this.host}:${this.port}`);
    });
  }

  close() {
    for (const client of this.sseClients) {
      try { client.end(); } catch {}
    }
    this.sseClients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
