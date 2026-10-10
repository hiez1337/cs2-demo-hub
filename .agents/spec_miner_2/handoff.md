# CSREP & FACEIT Demo Uploader — Architectural Target Specifications & Security Mining Report

**Agent**: `teamwork_preview_spec_miner_2`  
**Date**: 2026-08-23  
**Working Directory**: `C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\.agents\spec_miner_2`  
**Target Reference**: `ORIGINAL_REQUEST.md` (R1, R2, R3)

---

## 1. Executive Summary
This document provides the authoritative architectural target specification, interface contracts, security requirements, and error catalogs mined for the CSREP & FACEIT Demo Uploader refactoring project. The monolithic legacy scripts (`.backup_v2/index.js`, `.backup_v2/playwright-uploader.js`, `.backup_v2/cli.js`) have been decomposed into a clean, event-driven, layered modular architecture under `src/` following Domain-Driven and Clean Architecture principles.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Config | Environment & JSON Loader | Merges `.env` variables and `config.json` with Zod validation | `.env`, `config.json`, CLI flags | `Config` object | Throws validation error or falls back to safe schema | `src/config/index.js`, `schema.js` |
| 2 | Config | Zod Schema Validation | Strict schema validating SteamID64, API keys, ports, concurrency | Raw config object | Validated & coerced `Config` | Rejects non-17 digit Steam IDs, out-of-range ports/concurrency | `src/config/schema.js` |
| 3 | Domain | CSREP Crypto Header Signing | Deterministic base36 bitwise hash generation for CSREP API headers | Request ID (UUID) + Timestamp | Headers object (`X-Request-ID`, `X-Request-Timestamp`, `X-Request-Secret`) | Deterministic calculation, never throws | `src/domain/csrep-crypto.js` |
| 4 | Domain | Match Score Parsing | Normalizes score from strings, arrays, objects; computes win/loss | `string \| number[] \| object \| null` | `{ scoreStr: string, isWin: boolean, team1: number, team2: number }` | Returns safe fallback `{ scoreStr: '—', isWin: false, ... }` on empty/invalid | `src/domain/match-parser.js` |
| 5 | Domain | Map Metadata & Emojis | Maps CS2 map code to stylized name and emoji | `mapName: string \| null` | Formatted string (e.g., `🏛️ DE_MIRAGE`) | Returns `🎯 ${UPPERCASE}` for custom/unknown maps | `src/domain/maps.js` |
| 6 | Domain | Domain Models & DTOs | Typed DTO interfaces for matches, progress, stats, logs, snapshots | Raw API entities | Typed `CsrepMatch`, `MatchProgress`, `SyncStats`, `LogEntry` | Validates required fields | `src/domain/models.js` (R1 requirement) |
| 7 | Storage | Atomic File I/O | Safe read and atomic write via temporary file + rename | File path, data object | `boolean` (write success), `T` (parsed JSON) | Safe fallback on missing files; unlinks temp file on write error | `src/storage/atomic-file.js` |
| 8 | Storage | History Store | Tracks uploaded match IDs in a persistent set to avoid duplicate uploads | `matchId: string` | Query methods (`has`, `getAll`, `size`) | Atomic persistence to `uploaded_history.json` | `src/storage/history-store.js` |
| 9 | Storage | Cookie Store & RFC 6265 Normalizer | Loads/saves browser cookies, formats `__Host-` and `__Secure-` prefixes for Playwright | `rawCookies: Array` | `normalizedCookies: Array` | Filters malformed cookies; warns on invalid structure | `src/storage/cookie-store.js` |
| 10 | Storage | CSREP JWT Expiry Checker | Inspects `csrep-access-token` JWT payload exp timestamp | `cookies: Array` | `boolean` (isExpired: true if < 300s remaining) | Returns `true` if cookie missing or payload unparseable | `src/storage/cookie-store.js` |
| 11 | Browser | Browser Lifecycle Manager | Manages persistent Playwright Chromium context, stealth flags, cookies | `headless: boolean` | `BrowserContext` | Creates directories recursively; saves session on close | `src/browser/browser-manager.js` |
| 12 | API | FACEIT Open API Client | Fetches match details and extracts CDN demo URL via REST API | `matchId: string` | Match details JSON / Demo URL string | Returns `null` on 401/404; logs authorization warnings | `src/api/faceit/client.js` |
| 13 | API | FACEIT Demo Downloader | Downloads demo via signed URL internal API or DOM room download fallback | `match: CsrepMatch`, `pageFaceit`, `signal` | `Buffer` of demo archive | Returns `null` if expired (>30d); propagates `AbortError` | `src/api/faceit/downloader.js` |
| 14 | API | CSREP Match Scanner | Evaluates in-browser fetch to list DEMO_MISSING matches across paginated API | `steamId: string`, `maxPages: number` | Array of missing `CsrepMatch` DTOs | Stops pagination on last page or network error | `src/api/csrep/client.js` |
| 15 | API | CSREP Multipart Uploader | Inits upload, fetches presigned part URLs, completes and links file to match | `token`, `partNumber`, `csrepMatchId`, `fileId` | `{ token, fileId }`, presigned URL, linked ID | Throws descriptive error on HTTP failure | `src/api/csrep/uploader.js` |
| 16 | Core | Chunk Worker Pool | Parallel worker pool for uploading file chunks to Cloudflare R2 | `fileBuffer`, `getPresignUrlFn`, `onProgressFn`, `signal` | `Promise<void>` | Retries chunks up to 3x with backoff; handles cancellation | `src/core/chunk-worker-pool.js` |
| 17 | Core | Central State Store | Event-driven state manager and event bus emitting logs, progress, stats | State mutation actions | Emits typed events (`log`, `progress`, `stats`, `state`) | Maintains 150-item ring buffer for memory safety | `src/core/state-store.js` |
| 18 | Core | Pipeline Sync Orchestrator | End-to-end orchestration: scan, pipeline download, chunk upload, link, notify | CLI/UI commands (`scan`, `uploadMatches`, `login`, `stop`) | Pipeline execution | Catches per-match errors and updates fail stats; supports AbortSignal | `src/core/sync-orchestrator.js` |
| 19 | Infrastructure | Secure OS Notifier | Dispatches Windows Toast notifications with XML entity escaping | `title: string`, `body: string` | Dispatched notification | Non-Windows platforms safely ignored; executes via `execFile` | `src/infrastructure/notifier.js` |
| 20 | Infrastructure | Process Guard | Graceful shutdown handling for `SIGINT`, `SIGTERM`, unhandled rejections | Cleanup callback `{ onShutdown }` | Clean process exit | Prevents re-entrant shutdown loops; logs uncaught exceptions | `src/infrastructure/process-guard.js` |
| 21 | CLI | Interactive Menu & Wizard | Full terminal UI menu with setup wizard for Steam ID and options | Terminal input (`rl`) | Interactive execution | Reprompts on invalid choice; validates 17-digit Steam ID | `src/cli/menu.js`, `setup-wizard.js` |
| 22 | CLI | Console Progress Renderer | Renders real-time ASCII progress bar and color-coded status logs | State store event subscriptions | Terminal stdout | Throttles and formats speed (MB/s) and percentages | `src/cli/renderer.js` |
| 23 | Server | Web Studio HTTP & SSE Server | Serves static Web UI, streams SSE events, handles REST commands | HTTP requests on `127.0.0.1` | HTML, JSON, EventStream | Enforces 1MB request body limit; safe client disconnect | `src/server/web-server.js` |
| 24 | Entrypoint | Unified Bootstrap Runner | Supports flags `--all`, `--watch`, `--login`, `--ui`, `--pages`, `--concurrency`, `--port` | CLI arguments (`process.argv`) | CLI / Server execution | Exits cleanly on `--help`; catches bootstrap errors | `index.js`, `cli.js` |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Match Parser | Non-standard string score (`"13-9"`, `" 16 : 14 "`) | Normalized to `"13:9"` and `"16:14"`; `isWin` computed correctly (`13 > 9` -> true). |
| 2 | Match Parser | Object / Array score formats (`{ a: 5, b: 13 }`, `[13, 16]`) | Correctly parsed into `"5:13"` and `"13:16"`; `isWin` computed as false. |
| 3 | Match Parser | `null`, `undefined`, empty string `""` | Safe fallback `{ scoreStr: '—', isWin: false, team1: 0, team2: 0 }` without exceptions. |
| 4 | Maps Domain | Unknown custom map name (e.g., `"workshop_aim_botz"`) | Fallback formatted string: `🎯  WORKSHOP_AIM_BOTZ`. |
| 5 | Maps Domain | `null` or `undefined` map name | Safe fallback string: `🎯  UNKNOWN`. |
| 6 | CSREP Crypto | Arbitrary Unicode and symbols in request payload | Deterministic 32-bit bitwise hash converted to base36; valid headers generated. |
| 7 | Cookie Store | Cookie with `__Host-` prefix and invalid domain | Normalized to `url: 'https://csrep.gg'` or `https://www.faceit.com'` and `secure: true`. |
| 8 | Cookie Store | Cookie with `__Secure-` prefix | Normalized to `secure: true` and sanitized domain. |
| 9 | Cookie Store | Malformed cookie with empty `name` | Filtered out of normalized array. |
| 10 | Cookie Store | JWT `csrep-access-token` expiring in < 300 seconds | `isExpired()` returns `true`, triggering re-authentication prompt. |
| 11 | Cookie Store | Malformed or non-JWT `csrep-access-token` | Returns `false` or handles parse failure safely without crashing. |
| 12 | Atomic Storage | Write to file in non-existent directory path | Recursively creates parent directories before writing temporary file. |
| 13 | Atomic Storage | Read from non-existent file (`ENOENT`) | Returns provided `defaultValue` (or `null`) without throwing. |
| 14 | Atomic Storage | Write error (permission denied / disk full) | Unlinks `.tmp` file and returns `false` without leaving corrupted file. |
| 15 | Chunk Worker Pool | Small file (< chunk size, e.g. 3MB with 10MB chunk) | Creates single part (Part 1/1) and uploads successfully. |
| 16 | Chunk Worker Pool | File with size exact multiple of chunk size (e.g. 20MB = 2x10MB) | Generates exact 2 parts without empty trailing part. |
| 17 | Chunk Worker Pool | Network timeout / 500 error on PUT upload | Retries up to 3 times with progressive backoff before failing. |
| 18 | Chunk Worker Pool | User triggers `AbortSignal` during chunk upload | Cancels active worker promises immediately and throws abort error. |
| 19 | OS Notifier | Title or body with XML tags (`<script>alert("XSS")</script>&'"`)| Sanitized to `&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;&amp;&apos;&quot;`. |
| 20 | OS Notifier | Title/body exceeding length threshold (>100 or >200 chars) | Truncated safely to prevent buffer overflows or OS notification errors. |
| 21 | Web Server | Malicious client sending huge POST payload (> 1MB) | Stream destroyed and connection closed, preventing denial of service. |
| 22 | Web Server | Client disconnects while SSE stream is open | Removed from `sseClients` set cleanly without unhandled write errors. |
| 23 | Process Guard | User presses `Ctrl+C` multiple times in rapid succession | Guard flag `isShuttingDown` prevents duplicate execution; closes browser context cleanly. |

---

## 4. Module Map & Architectural Target Specifications (R1)

```
src/
├── config/
│   ├── index.js          # ConfigManager class, .env loading, CLI flag overlay, save/load
│   └── schema.js         # Zod schema definition for all configuration parameters
├── domain/
│   ├── csrep-crypto.js   # Pure cryptographic signing for CSREP request headers
│   ├── maps.js           # Map metadata, icons/emojis, and display formatting
│   ├── match-parser.js   # Score parsing, win/loss determination, date formatting
│   └── models.js         # Data Transfer Objects (DTOs), interfaces, and type schemas
├── storage/
│   ├── atomic-file.js    # Safe JSON reader & atomic writer with temporary files
│   ├── cookie-store.js   # RFC 6265 cookie normalizer, JWT expiration validator
│   └── history-store.js  # Uploaded match ID persistence store (Set backed)
├── browser/
│   └── browser-manager.js# Playwright persistent context lifecycle, stealth, session cookies
├── api/
│   ├── faceit/
│   │   ├── client.js     # FACEIT Open API v4 client (metadata & demo URLs)
│   │   └── downloader.js # FACEIT demo downloader (Signed URL + DOM fallback)
│   └── csrep/
│       ├── client.js     # CSREP match scanner (in-browser pagination & filter)
│       └── uploader.js   # CSREP multipart upload initiator, presigner, linker
├── core/
│   ├── chunk-worker-pool.js # Parallel async worker pool for R2 chunk PUT uploads
│   ├── state-store.js       # Central AppStateStore (EventEmitter) with ring log buffer
│   └── sync-orchestrator.js # End-to-end sync pipeline & background watch coordinator
├── infrastructure/
│   ├── notifier.js       # Windows OS Toast dispatcher with XML escaping & execFile
│   └── process-guard.js  # Process signal hooks (SIGINT/SIGTERM) & graceful resource cleanup
├── cli/
│   ├── menu.js           # Interactive CLI menu loop
│   ├── renderer.js       # Terminal ASCII progress bar & event log renderer
│   └── setup-wizard.js   # Initial Steam ID validation wizard
├── server/
│   └── web-server.js     # Web Studio HTTP server & SSE real-time event broadcaster
└── index.js              # Unified application bootstrap & CLI router
```

---

## 5. Detailed Interface Contracts & Signatures

### 5.1 Configuration Layer (`src/config/`)

#### `ConfigSchema` (`src/config/schema.js`)
```typescript
interface Config {
  steamId: string;               // 17-digit SteamID64
  faceitApiKey: string;          // FACEIT Data API key
  maxPages: number;              // 1 - 100 (default: 3)
  chunkConcurrency: number;      // 1 - 16 (default: 4)
  chunkSizeBytes: number;        // min 1MB (default: 10485760 = 10MB)
  webPort: number;               // 1024 - 65535 (default: 3333)
  webHost: string;               // default: '127.0.0.1'
  watchIntervalMinutes: number;  // 1 - 1440 (default: 10)
  apiSecretToken?: string;       // Optional CSRF/API protection token
  tempDownloadsDir: string;      // default: './demos_temp'
  browserSessionDir: string;     // default: './.browser_session'
  cookiesFile: string;           // default: './cookies.json'
  historyFile: string;           // default: './uploaded_history.json'
}
```

#### `ConfigManager` (`src/config/index.js`)
- `constructor(customConfigPath?: string)`
- `load(): Config`: Merges `process.env` + `config.json` -> parses through `ConfigSchema` -> returns valid `Config`.
- `save(partialConfig: Partial<Config>): boolean`: Atomically updates `config.json`.
- `applyCliArgs(argv: string[]): Config`: Overrides settings from command line options (`--pages`, `--concurrency`, `--port`, `--steam`).

---

### 5.2 Pure Domain Layer (`src/domain/`)

#### `csrep-crypto.js`
- `computeCsrepSecret(str: string): string`
  - **Parameters**: `str` (string to hash)
  - **Returns**: Base-36 unsigned 32-bit hash string (`hash >>> 0).toString(36)`)
  - **Guarantees**: Deterministic, pure, no side effects.
- `generateCsrepHeaders(additionalHeaders?: Record<string, string>): Record<string, string>`
  - **Returns**: Headers object with `X-Request-ID` (UUIDv4), `X-Request-Timestamp`, `X-Request-Secret`, `Accept`.

#### `match-parser.js`
- `parseMatchScore(score: string | number[] | Record<string, any> | null): MatchScoreResult`
  ```typescript
  interface MatchScoreResult {
    scoreStr: string;   // formatted as "13:9" or "—"
    isWin: boolean;     // true if team1 > team2
    team1: number;
    team2: number;
  }
  ```
- `formatMatchDate(dateVal: string | number | Date | null): string`
  - **Returns**: Localized date string (`ru-RU`) or fallback string.

#### `maps.js`
- `MAP_EMOJIS: Record<string, string>`: Constant dictionary of map codes to display names.
- `getMapTitle(mapName: string | null): string`: Returns formatted map name with emoji.

#### `models.js`
```typescript
interface CsrepMatch {
  csrepMatchId: string;
  faceitMatchId: string;
  map: string;
  date: string;
  score: any;
  status?: string;
  statusClass?: string;
  statusText?: string;
}

interface MatchProgress {
  overallPercent: number;
  filePercent: number;
  matchTitle: string;
  speedInfo: string;
  activeMatchId: string | null;
  matchStatus: string;
  matchStatusClass: string;
}

interface SyncStats {
  total: number;
  uploaded: number;
  skipped: number;
  failed: number;
  trafficMb: number;
}

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
  time: string;
}

interface AppSnapshot {
  status: 'idle' | 'scanning' | 'uploading' | 'stopped';
  config: Config;
  matches: CsrepMatch[];
  stats: SyncStats;
  currentProgress: MatchProgress;
  logs: LogEntry[];
}
```

---

### 5.3 Storage Layer (`src/storage/`)

#### `atomic-file.js`
- `readJsonSafe<T>(filePath: string, defaultValue?: T): T`
- `writeJsonAtomic(filePath: string, data: any): boolean`
  - **Algorithm**: `filePath` -> `${filePath}.tmp.${randomHex}` -> `fs.writeFileSync` -> `fs.renameSync`.

#### `history-store.js`
- `constructor(historyPath?: string)`
- `load(): Set<string>`
- `has(matchId: string): boolean`
- `add(matchId: string): void`
- `save(): boolean`
- `getAll(): string[]`
- `size(): number`

#### `cookie-store.js`
- `constructor(cookiesPath?: string)`
- `load(): Array<any>`
- `save(cookies: Array<any>): boolean`
- `normalizeForPlaywright(rawCookies: Array<any>): Array<PlaywrightCookie>`
  - Handles `__Host-` -> `url: 'https://...'`, `secure: true`
  - Handles `__Secure-` -> `secure: true`
  - Strips empty/undefined names
- `isExpired(cookies: Array<any>): boolean`
  - Decodes base64 payload of `csrep-access-token` cookie
  - Checks if `exp - nowSec < 300` (expires in under 5 minutes).

---

### 5.4 Browser Management Layer (`src/browser/`)

#### `BrowserManager` (`src/browser/browser-manager.js`)
- `constructor(config: Config, cookieStore: CookieStore)`
- `getContext(headless?: boolean): Promise<BrowserContext>`
  - Persistent Chromium session at `config.browserSessionDir`.
  - Flags: `['--disable-blink-features=AutomationControlled']`.
  - Injects cookies via `cookieStore.normalizeForPlaywright()`.
- `saveCookies(): Promise<void>`
  - Extracts cookies for `https://csrep.gg` and `https://www.faceit.com`.
  - Saves via `cookieStore.save()`.
- `close(): Promise<void>`: Saves cookies and closes context safely.

---

### 5.5 Service Clients & API Layer (`src/api/`)

#### `FaceitApiClient` (`src/api/faceit/client.js`)
- `constructor(apiKey: string)`
- `getMatchDetails(matchId: string): Promise<Record<string, any> | null>`
- `extractDemoUrl(matchData: Record<string, any> | null): string | null`

#### `FaceitDownloader` (`src/api/faceit/downloader.js`)
- `constructor(apiClient: FaceitApiClient, tempDownloadsDir: string)`
- `downloadDemo(match: CsrepMatch, pageFaceit: Page, signal?: AbortSignal): Promise<Buffer | null>`
  - 1. Checks `matchData.demo_url`.
  - 2. Calls internal `https://www.faceit.com/api/download/v2/demos/download-url`.
  - 3. Fallback: Navigates to `https://www.faceit.com/ru/cs2/room/{match.faceitMatchId}` and captures download event.

#### `CsrepClient` (`src/api/csrep/client.js`)
- `getMissingMatches(pageCsrep: Page, steamId: string, maxPages?: number, signal?: AbortSignal): Promise<CsrepMatch[]>`
  - Navigates to `https://csrep.gg/player/{steamId}`.
  - In-browser paginated fetch to `/api/players/{steamId}/matches` with CSREP crypto signature.
  - Filters `match.status === 'DEMO_MISSING' && match.source === 'FACEIT'`.

#### `CsrepUploader` (`src/api/csrep/uploader.js`)
- `initMultipartUpload(pageCsrep: Page, filename: string, size: number): Promise<{ token: string, fileId: string }>`
- `getPresignedUrl(pageCsrep: Page, token: string, partNumber: number): Promise<string>`
- `completeUploadAndLink(pageCsrep: Page, token: string, csrepMatchId: string, fileId: string): Promise<string>`

---

### 5.6 Core Concurrency & Orchestration Layer (`src/core/`)

#### `ChunkWorkerPool` (`src/core/chunk-worker-pool.js`)
- `constructor(concurrency?: number, partSize?: number)`
- `upload(fileBuffer: Buffer, getPresignUrlFn: (partNum: number) => Promise<string>, onProgressFn?: (p: { completedChunks: number, totalChunks: number, percent: number, speedMb: string }) => void, signal?: AbortSignal): Promise<void>`
- `uploadChunkWithRetry(putUrl: string, chunk: Buffer, maxRetries?: number, signal?: AbortSignal): Promise<boolean>`
- `pMap<T, R>(array: T[], iterator: (item: T, idx: number) => Promise<R>, concurrency?: number, signal?: AbortSignal): Promise<R[]>`

#### `AppStateStore` (`src/core/state-store.js`)
- Inherits: `EventEmitter`
- State: `{ status, config, matches, activeMatchId, currentProgress, stats, logs }`
- Methods:
  - `log(message: string, level?: 'info'|'success'|'warn'|'error'): void`
  - `setStatus(status: string): void`
  - `setMatches(matches: CsrepMatch[]): void`
  - `updateProgress(patch: Partial<MatchProgress>): void`
  - `updateStats(patch: Partial<SyncStats>): void`
  - `updateMatchStatus(matchId: string, statusClass: string, statusText: string): void`
  - `getSnapshot(): AppSnapshot`

#### `SyncOrchestrator` (`src/core/sync-orchestrator.js`)
- `constructor(deps: { config, stateStore, browserManager, faceitApiClient, faceitDownloader, csrepClient, csrepUploader, historyStore, chunkWorkerPool })`
- `scan(pages?: number): Promise<CsrepMatch[]>`
- `uploadMatches(matchList: CsrepMatch[]): Promise<void>`
- `interactiveLogin(rl?: readline.Interface): Promise<void>`
- `stop(): void`

---

### 5.7 Infrastructure Layer (`src/infrastructure/`)

#### `notifier.js`
- `sanitizeXml(str: string): string`: Converts `<`, `>`, `&`, `"`, `'` to XML entities.
- `sendToast(title: string, body: string): void`: Dispatches toast via `powershell.exe` with parameterized arguments and XML escaping.

#### `process-guard.js`
- `registerProcessGuard(options: { onShutdown: () => Promise<void> }): void`: Attaches signal handlers (`SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection`).

---

### 5.8 UI & Web Server (`src/cli/`, `src/server/`)

#### `WebServer` (`src/server/web-server.js`)
- `constructor(port?: number, host?: string, stateStore?: AppStateStore, orchestrator?: SyncOrchestrator)`
- `start(): void`: Starts HTTP server on host (default: `127.0.0.1`), routes `/`, `/api/events`, `/api/state`, `/api/scan`, `/api/start`, `/api/upload-single`, `/api/stop`.
- `broadcast(data: any): void`: Sends SSE event to all connected clients.
- `close(): void`: Terminates SSE connections and closes server.

#### `CliRenderer` (`src/cli/renderer.js`)
- Subscribes to `stateStore` events and renders log messages and progress bar in terminal.

---

## 6. Security Requirements & Hardening Specifications (R2)

### 6.1 Secrets & Environment Isolation
1. **Zero Hardcoded Secrets**:
   - The default Steam ID in `src/config/schema.js` must be empty string `''` or validated via runtime prompt/`.env`, NOT hardcoded with a personal Steam ID.
   - `config.json` containing live Steam IDs or API keys must NOT be committed to git.
2. **Environment Configuration**:
   - `.env.example` serves as the standard template.
   - All runtime variables (`STEAM_ID`, `FACEIT_API_KEY`, `WEB_PORT`, `WEB_HOST`, `CHUNK_CONCURRENCY`, `MAX_PAGES`) are loaded through `dotenv` and validated via Zod.

### 6.2 `.gitignore` Isolation Rules
The following files and directories MUST be ignored:
```gitignore
.env
.env.local
.env.*.local
config.json
cookies.json
cookies.txt
*.session.enc
uploaded_history.json
.browser_session/
demos_temp/
*.dem
*.dem.gz
*.dem.zst
.backup_v2/
coverage/
*.log
node_modules/
```

### 6.3 Windows Toast Notification Injection Mitigation
- Direct PowerShell string concatenation (`exec("... " + title + " ...")`) is vulnerable to command and script injection.
- Required mitigation:
  1. Sanitization: All strings passed to XML nodes are sanitized via `sanitizeXml()` escaping `<`, `>`, `&`, `"`, `'`.
  2. Input Capping: Titles truncated to 100 characters, bodies truncated to 200 characters.
  3. Execution: Parameterized invocation via `execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript])`.

### 6.4 Web Studio Network Security
- Bound strictly to loopback interface `127.0.0.1` by default.
- Request body limit capped at 1MB to prevent memory exhaustion DOS attacks.
- API Secret Token support for CSRF prevention on non-local bindings.

---

## 7. Five-Component Handoff Report

### 1. Observation
1. **Existing Monolith vs Modularization**: In `.backup_v2/index.js`, `.backup_v2/playwright-uploader.js`, and `.backup_v2/cli.js`, business logic, UI, Playwright context, curl subprocess calls, and HTTP servers were tightly coupled in single 600-900 line files.
2. **Current `src/` Layout**: `src/` modules have been mapped out (config, domain, storage, browser, api, core, infrastructure, cli, server), but `src/domain/models.js` was missing and needed formal specification.
3. **Hardcoded Secrets**: Found hardcoded Steam ID (`76561198434644264`) in `src/config/schema.js:7` and `config.json:2`. Found hardcoded FACEIT API key in `config.json:3`.
4. **Test Suite Status**: Running `npm test` passed 17 unit tests across 6 files. Running `npm run test:coverage` resulted in 25.65% line coverage (below the 80% threshold) due to missing integration tests and unexercised core/api modules.
5. **Entrypoint Execution**: `node index.js --help` failed because top-level static import of `BrowserManager` attempted to resolve `playwright` before checking `--help`.

### 2. Logic Chain
1. *Observation 3* (Hardcoded Steam ID in `schema.js`) + *R2 Constraint* (Elimination of hardcoded secrets) $\implies$ `schema.js` default must be purged to `''` or validated at runtime, and `config.json` must be isolated via `.gitignore`.
2. *Observation 2* (Missing `models.js`) + *R1 Constraint* (Explicit requirement for `models.js` DTOs) $\implies$ Full DTO specification defined in Section 5.2.
3. *Observation 4* (Test coverage at 25.65%) + *R3 Constraint* (>= 80% threshold) $\implies$ Unit and integration tests must be created for `chunk-worker-pool.js`, `state-store.js`, `sync-orchestrator.js`, `cookie-store.js`, and API mocks.
4. *Observation 5* (`index.js --help` failure on missing Playwright) $\implies$ `index.js` must parse `--help` and CLI flags before side-effects, or use dynamic dependency handling for optional CLI commands.

### 3. Caveats
- Playwright browser execution requires Chromium binaries when running interactive login or live scraping; unit tests must mock Playwright Page and evaluate functions to run in headless CI environments without downloading 200MB binaries.
- Windows Toast notifications require `powershell.exe` on Windows; non-Windows OS execution safely ignores toast dispatch without throwing.

### 4. Conclusion
The architectural blueprint, interface contracts, error specifications, and security policies have been mined and formally documented. All modules under `src/` have well-defined boundaries, pure domain logic is decoupled from side-effecting I/O and Playwright automation, and security requirements (purging secrets, XML escaping, `.gitignore` rules) are clearly specified.

### 5. Verification Method
- **Unit & Domain Tests**: Run `npx vitest run tests/unit/` to verify pure domain logic, crypto hashes, score parsing, map titles, and atomic storage.
- **Coverage Check**: Run `npm run test:coverage` to verify line, function, statement, and branch coverage metrics against threshold >= 80%.
- **CLI Flags**: Run `node index.js --help` to verify exit code 0 and usage output.
- **Security Check**: Run `git status --ignored` to confirm `.env`, `config.json`, `cookies.json`, and session folders are properly ignored.
