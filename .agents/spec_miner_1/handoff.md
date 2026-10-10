# Specification Mining & Architecture Analysis Report

**Agent**: `spec_miner_1` (`teamwork_preview_spec_miner_1`)  
**Timestamp**: 2026-08-23T04:00:00Z  
**Project**: CSREP & FACEIT Demo Uploader Pro  
**Working Directory**: `C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\.agents\spec_miner_1\`  
**Project Root**: `C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\`

---

## 1. Observation

A comprehensive structural and code-level audit of the workspace was performed, covering the legacy implementations (`.backup_v2/cli.js`, `.backup_v2/playwright-uploader.js`, `.backup_v2/csrep-demo-uploader.user.js`, `.backup_v2/csrep_sniffer.js`, `.backup_v2/public/index.html`), current entrypoints (`cli.js`, `index.js`), configuration templates (`.env.example`, `config.json`), storage files (`cookies.json`, `cookies.txt`, `uploaded_history.json`), modular source code in `src/`, and test suites in `tests/`.

### Direct File & Code Observations:
1. **Monolithic Scripts Analyzed**:
   - `.backup_v2/cli.js` (769 lines): Monolithic CLI implementation with embedded Playwright browser orchestration, manual chunk splitting (10MB), custom `X-Request-Secret` signing, Windows Toast execution via PowerShell, and interactive CLI menus.
   - `.backup_v2/playwright-uploader.js` (951 lines): Monolithic event-driven engine featuring an HTTP server, Server-Sent Events (SSE) `/api/events`, static file server for `./public/index.html`, and REST controllers (`/api/state`, `/api/scan`, `/api/start`, `/api/upload-single`, `/api/stop`).
   - `.backup_v2/csrep-demo-uploader.user.js` (1115 lines): Tampermonkey userscript documenting cross-origin API calls, `.dem.gz` to `.dem.zst` transcoding via WASM/fzstd, and fallback injection mechanisms.
   - `.backup_v2/csrep_sniffer.js` (153 lines): Network sniffer intercepting CSREP API payloads, headers, and responses.
   - `.backup_v2/public/index.html` (1113 lines): Frontend SPA for Web Studio dashboard utilizing SSE streams and REST calls.

2. **Modular Architecture (`src/`)**:
   - `src/config/`: `schema.js` defines Zod schema validation; `index.js` manages configuration hierarchy (`CLI args > .env > config.json > defaults`). Note: `src/config/schema.js:7` contains a hardcoded default Steam ID (`76561198434644264`).
   - `src/domain/`: Pure domain utilities:
     - `csrep-crypto.js`: Bitwise hashing and UUID/timestamp signature generation.
     - `match-parser.js`: Normalizes scores across strings (`"13:9"`, `"13-9"`), arrays (`[13, 9]`), and objects (`{team1: 13, team2: 9}`).
     - `maps.js`: Dictionary and helper for CS2 map display titles with emojis.
   - `src/storage/`:
     - `atomic-file.js`: Safe JSON reading and atomic file writing via `.tmp.<hex>` and `fs.renameSync`.
     - `cookie-store.js`: Cookie persistence with RFC 6265 normalizer and JWT expiration detection.
     - `history-store.js`: Set-based store for `uploaded_history.json`.
   - `src/browser/`:
     - `browser-manager.js`: Manages Playwright persistent context (`.browser_session/`), injects cookies, and handles session persistence.
   - `src/api/`:
     - `faceit/client.js`: HTTP client for FACEIT Open Data API (v4).
     - `faceit/downloader.js`: Downloads demos via signed CDN URL or room page DOM fallback (`waitForEvent('download')`).
     - `csrep/client.js`: Browser page-evaluated client for scanning missing matches.
     - `csrep/uploader.js`: Browser page-evaluated multipart upload initializer, presigner, and match linker.
   - `src/core/`:
     - `chunk-worker-pool.js`: Multipart upload pool with bounded concurrency (`pMap`), exponential backoff retries, and `AbortSignal` support.
     - `state-store.js`: `EventEmitter`-based reactive store with ring buffer for logs (150 items).
     - `sync-orchestrator.js`: High-level workflow engine orchestrating scan, pre-download, chunked upload, and match linking.
   - `src/infrastructure/`:
     - `notifier.js`: Windows Toast notification sender with XML sanitization (`sanitizeXml`) and parameterized `execFile`.
     - `process-guard.js`: Graceful shutdown handler capturing `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection`.
   - `src/cli/` & `src/server/`:
     - `menu.js`, `renderer.js`, `setup-wizard.js`: CLI interactive menus and progress bars.
     - `web-server.js`: HTTP and SSE server binding to `127.0.0.1:3333` with 1MB request body limit.

3. **Observed Test & Runtime Status**:
   - `npm test` runs 6 unit test files (17 tests) and passes in ~284ms.
   - `npm run test:coverage` reports 25.65% line coverage (below 80% threshold requirement).
   - `node index.js --help` currently throws `ERR_MODULE_NOT_FOUND` because `index.js` statically imports `BrowserManager` which imports `playwright`.
   - Project root is missing `public/index.html` (present in `.backup_v2/public/index.html`).

---

## 2. Logic Chain

1. **Workflow Pipeline Logic**:
   - Finding missing matches requires evaluating fetch requests within the browser context (`csrep.gg`) to leverage existing session cookies and anti-bot credentials (`cf_clearance`).
   - Match scanning filters for `status === 'DEMO_MISSING'`, `source === 'FACEIT'`, and a valid `source_id` (FACEIT Match ID).
   - Once missing matches are identified, each match requires:
     1. Retrieving the raw demo URL from FACEIT API v4 (`https://open.faceit.com/data/v4/matches/{matchId}`).
     2. Converting the raw URL into a signed direct download link via FACEIT internal endpoint (`POST https://www.faceit.com/api/download/v2/demos/download-url`) with header `faceit-referer: web-next`, or falling back to clicking the download button in the match room.
     3. Initializing a multipart upload session on CSREP (`POST /api/uploads/demos`), yielding an upload `token` and `fileId`.
     4. Splitting the `.dem.zst` binary buffer into 10MB chunks and uploading concurrently to Cloudflare R2 presigned URLs (`POST /api/uploads/_presign` -> `PUT presignedUrl`).
     5. Finalizing the upload (`POST /api/uploads/_complete`) and linking the demo to the match record (`POST /api/matches/{csrepMatchId}` with `{ demo_url: "file://{fileId}" }`).
     6. Persisting the completed CSREP match ID to `uploaded_history.json`.

2. **Security & Injection Prevention Logic**:
   - Storing API keys and Steam IDs in `.env` prevents credential leakage into source repositories.
   - Escaping XML entities (`<`, `>`, `&`, `"`, `'`) in `notifier.js` prevents command injection when executing PowerShell Toast notification scripts.
   - Restricting Web Studio server to `127.0.0.1` and limiting POST request bodies to 1MB mitigates remote exploitation and DoS vectors.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth & Session | Interactive Browser Login | Launches non-headless Chromium to log into CSREP and FACEIT; saves cookies | `rl` readline interface | `cookies.json` updated with RFC 6265 cookies | Logs error on failure, closes browser gracefully | `cli.js`, `playwright-uploader.js`, `src/browser/browser-manager.js` |
| 2 | Auth & Session | Cookie Normalization & RFC 6265 Compliance | Normalizes raw cookies for Playwright (`__Host-` uses URL, `__Secure-` uses secure flag, domain formatting) | Raw cookie array | Playwright-compatible cookie array | Skips invalid cookies without name or value | `src/storage/cookie-store.js` |
| 3 | Auth & Session | JWT Token Expiration Detection | Decodes base64 payload of `csrep-access-token` to check `exp` timestamp against current time (< 5 min) | Cookie array | Boolean `isExpired` | Catches parse errors, returns false | `src/storage/cookie-store.js` |
| 4 | Discovery | Match Scanning & Pagination | Scans csrep.gg player matches page by page (20/page) for `DEMO_MISSING` and `FACEIT` matches | `steamId`, `maxPages` (1-100) | Array of missing match DTOs | Stops pagination on non-200 or `hasNextPage === false` | `src/api/csrep/client.js`, `.backup_v2/cli.js` |
| 5 | Crypto | CSREP Header Signing | Computes custom bitwise hash $(hash \ll 5) - hash + c$ and generates `X-Request-ID`, `X-Request-Timestamp`, `X-Request-Secret` | Additional header object (optional) | Signature headers record | Deterministic hash generation | `src/domain/csrep-crypto.js` |
| 6 | Download | FACEIT API v4 Match Metadata | Fetches match details and extracts raw `demo_url` via Open Data API | `matchId`, `apiKey` | JSON match object or `null` | Logs warning on 401/404, returns `null` | `src/api/faceit/client.js` |
| 7 | Download | FACEIT Signed Download URL | Requests direct signed CDN URL from FACEIT internal download API | `rawUrl`, `pageFaceit` | Signed CDN download URL | Falls back to DOM room navigation on failure | `src/api/faceit/downloader.js` |
| 8 | Download | FACEIT Room DOM Download Fallback | Navigates to `faceit.com/ru/cs2/room/{id}`, clicks "Смотреть демо"/"Download demo", intercepts Playwright download event | `match`, `pageFaceit` | Binary Buffer | Times out after 20s, returns `null` | `src/api/faceit/downloader.js` |
| 9 | Download | Pipelined Background Pre-download | Pre-downloads demo for match $i+1$ in background while match $i$ uploads to CSREP | Next match object, abort signal | Promise resolving to Buffer | Respects `AbortSignal`, skips if aborted | `src/core/sync-orchestrator.js` |
| 10 | Upload | CSREP Multipart Init | Initializes multipart demo upload session on CSREP | `filename`, `size` | `{ token, fileId }` | Throws error if token not returned | `src/api/csrep/uploader.js` |
| 11 | Upload | CSREP Presigned URL Request | Requests presigned PUT URL for a specific part number | `token`, `partNumber` | Presigned Cloudflare R2 URL | Throws error if URL not returned | `src/api/csrep/uploader.js` |
| 12 | Upload | Multipart Chunk Worker Pool | Concurrently uploads 10MB chunks to Cloudflare R2 presigned URLs with bounded concurrency | `fileBuffer`, `getPresignUrlFn`, `onProgressFn`, `concurrency` (1-16) | Resolves when all parts uploaded | Retries up to 3 times per chunk with exponential backoff ($1.2s \times n$) | `src/core/chunk-worker-pool.js` |
| 13 | Upload | CSREP Complete & Link Match | Finalizes multipart upload and links demo file ID to CSREP match record | `token`, `csrepMatchId`, `fileId` | Final completed file ID | Throws error on non-200 response | `src/api/csrep/uploader.js` |
| 14 | Storage | Atomic File Storage | Atomically writes JSON data via temporary `.tmp.<hex>` file and `fs.renameSync` | `filePath`, `data` | Boolean success | Cleans up temp file on error, logs failure | `src/storage/atomic-file.js` |
| 15 | Storage | Upload History Tracking | Tracks uploaded match IDs in `uploaded_history.json` to prevent re-uploading | `matchId` | Set / Array of match IDs | Safely loads existing history or defaults to empty set | `src/storage/history-store.js` |
| 16 | Monitoring | Watch Mode Daemon | Polls csrep.gg for new missing matches at configurable interval (`watchIntervalMinutes`) | Interval in minutes | Periodic scan and upload execution | Checks if `state.status === 'idle'` before starting new cycle | `src/core/sync-orchestrator.js`, `index.js` |
| 17 | Web Studio | HTTP & SSE Server | Serves static Web Studio SPA and SSE live stream (`/api/events`) for real-time progress | `port`, `host`, `stateStore`, `orchestrator` | HTTP Server instance | Enforces 1MB max body limit on POST requests | `src/server/web-server.js` |
| 18 | Web Studio | REST Control Endpoints | Endpoints `/api/state`, `/api/scan`, `/api/start`, `/api/upload-single`, `/api/stop` | JSON request payload | JSON `{ ok: true }` or state snapshot | Returns 404 for unknown endpoints | `src/server/web-server.js` |
| 19 | UI | Interactive CLI Menu | Terminal menu with options (1-6, 0) for scan, all, custom pages, watch, login, settings | User terminal input | Triggers corresponding orchestrator workflow | Reprompts on invalid choice | `src/cli/menu.js` |
| 20 | UI | Setup Wizard | Prompts user on first launch for SteamID64 if missing or default | User input / profile URL | Extracted 17-digit SteamID saved to config | Falls back to default if format invalid | `src/cli/setup-wizard.js` |
| 21 | Notifications | Secure Windows Toast | Sends native Windows Toast notifications via PowerShell with XML escaping | `title`, `body` | Toast popup | Non-Windows platforms silently bypassed; escapes special characters | `src/infrastructure/notifier.js` |
| 22 | Infrastructure | Process Guard & Graceful Shutdown | Hooks `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection` to close browser and server | OS signals / process errors | Clean resource cleanup and exit | Exits with code 0 after cleanup | `src/infrastructure/process-guard.js` |
| 23 | Domain | Map Metadata Resolver | Resolves map codes (e.g. `de_mirage`, `de_dust2`) to formatted titles with emojis | Map string | Formatted title string | Fallback: `🎯 UNKNOWN` or uppercase name | `src/domain/maps.js` |
| 24 | Domain | Match Score Parser | Normalizes match scores across strings, arrays, and objects into `{ scoreStr, isWin, team1, team2 }` | Raw score value | Normalized score object | Defaults to `{ scoreStr: '—', isWin: false, team1: 0, team2: 0 }` | `src/domain/match-parser.js` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Match Score Parser | `null` or `undefined` | Returns `{ scoreStr: '—', isWin: false, team1: 0, team2: 0 }` |
| 2 | Match Score Parser | Hyphenated score string `"9-13"` | Converts hyphen to colon, parses `team1: 9`, `team2: 13`, `isWin: false`, `scoreStr: "9:13"` |
| 3 | Match Score Parser | Array format `[16, 14]` | Parses `team1: 16`, `team2: 14`, `isWin: true`, `scoreStr: "16:14"` |
| 4 | Match Score Parser | Nested object `{ score1: 5, score2: 13 }` | Extracts numeric values, parses `team1: 5`, `team2: 13`, `scoreStr: "5:13"` |
| 5 | Map Title Resolver | `null`, `""`, or unknown map `"custom_aim"` | Returns `"🎯  UNKNOWN"` for null/empty; `"🎯  CUSTOM_AIM"` for unknown map |
| 6 | Cookie Store Normalizer | `__Host-` prefixed cookie without explicit url | Automatically assigns `url: 'https://csrep.gg'` (or faceit) and `secure: true`, strips domain per RFC 6265 |
| 7 | Cookie Store Normalizer | `__Secure-` prefixed cookie | Automatically assigns `secure: true` and appropriate domain |
| 8 | Cookie Store Expiration | Expired JWT timestamp (`exp < Date.now() / 1000 + 300`) | `isExpired()` returns `true` (prompts refresh if expiring in < 5 mins) |
| 9 | Chunk Worker Pool | Network failure during chunk PUT | Retries up to 3 times with exponential backoff; throws error on 3rd failure |
| 10 | Chunk Worker Pool | `AbortSignal` triggered mid-upload | Immediately aborts active fetch requests, stops queue processing, and throws `'Загрузка отменена'` / `'Aborted'` |
| 11 | FACEIT Downloader | Match older than 30 days (expired demo on CDN) | FACEIT API returns empty `demo_url` or 404; downloader returns `null`; orchestrator marks match `skipped` |
| 12 | Web Server POST | Malicious oversized payload (> 1MB) | Server terminates stream (`req.destroy()`), preventing memory exhaustion |
| 13 | Toast Notification | Title/body with XML injection strings (`<script>alert("x")</script>`) | Sanitizes `<>&"'` to `&lt;&gt;&amp;&quot;&apos;` before embedding in PowerShell script |
| 14 | CLI Option `--help` | Invocation before dependencies loaded | Static imports of Playwright cause module failure; dynamic import of browser modules required |
| 15 | Config Validation | Invalid Steam ID (not 17 digits) in environment | Zod schema validation fails with descriptive message; falls back to schema defaults |

---

## 5. Caveats

1. **Static Playwright Import in Entrypoint**: `index.js` statically imports `BrowserManager` at the top level. When executing `node index.js --help`, Node.js attempts to resolve the `playwright` module immediately. If `playwright` is not installed or if running in an environment without browser dependencies, `--help` fails. Lazy/dynamic import of `BrowserManager` or splitting CLI argument handling before importing browser drivers resolves this.
2. **Missing `public/` Directory in Project Root**: The Web Studio HTML interface exists in `.backup_v2/public/index.html` but has not been copied to `./public/index.html`. `WebServer` checks `fs.existsSync('./public/index.html')`, so the static UI will not load until the file is placed at `./public/index.html`.
3. **Hardcoded Steam ID Default in `schema.js`**: `src/config/schema.js:7` contains `.default('76561198434644264')`. Per R2 acceptance criteria, hardcoded credentials should be eliminated from `src/` and replaced with `.default('')` or required `.env` values.
4. **Test Coverage Threshold**: Current line coverage is 25.65%, whereas Vitest is configured to enforce $\ge 80\%$ lines, functions, and statements. Tests need to be added for `src/api/*`, `src/browser/*`, `src/core/*`, and `src/server/*`.

---

## 6. Conclusion

The specification mining of the CSREP & FACEIT Demo Uploader project is complete. All existing workflows, CLI flags, API endpoints, cryptographic signatures, persistence formats, error handling mechanisms, and edge cases have been identified, extracted, and cataloged.

The modular architecture in `src/` cleanly separates concerns across `config`, `domain`, `storage`, `browser`, `api`, `core`, `infrastructure`, `cli`, and `server`. The findings documented in this report provide complete interface contracts and behavior specifications for the implementation, security hardening, and test authoring phases.

---

## 7. Verification Method

To independently verify the discoveries and specifications documented in this report:

1. **Verify Unit Tests**:
   ```bash
   npm test
   ```
   *Expected*: All 6 test suites in `tests/unit/` pass.

2. **Verify Coverage Metrics**:
   ```bash
   npm run test:coverage
   ```
   *Expected*: Coverage report generated from v8 detailing coverage breakdown per module.

3. **Verify Config Schema and Domain Logic**:
   - Inspect `src/domain/csrep-crypto.js` to verify hashing algorithm and header generation format.
   - Inspect `src/domain/match-parser.js` and `tests/unit/match-parser.test.js` to verify score parsing rules.
   - Inspect `src/storage/cookie-store.js` and `tests/unit/storage.test.js` to verify RFC 6265 normalization and JWT expiration checks.
