# Comprehensive Testing Strategy & Vitest Architecture Investigation (R3)

**Author:** Explorer 3 (`teamwork_preview_explorer_3`)  
**Target:** CSREP & FACEIT Demo Uploader Refactoring Suite  
**Date:** 2026-08-23  

---

## 1. Observation

### 1.1 Existing Test Suite & Runner Configuration
Direct inspection of `package.json`, `vitest.config.js`, and `tests/` reveals:

- **Runner & Dependencies (`package.json`)**:
  - `vitest`: `^4.1.11`
  - `@vitest/coverage-v8`: `^4.1.11`
  - Scripts configured:
    - `"test": "vitest run"`
    - `"test:watch": "vitest"`
    - `"test:coverage": "vitest run --coverage"`

- **Vitest Configuration (`vitest.config.js`)**:
  - `globals: true`, `environment: 'node'`
  - `include: ['tests/**/*.test.js']`
  - Coverage provider: `v8`
  - Coverage thresholds: `lines: 80`, `functions: 80`, `branches: 75`, `statements: 80`
  - Coverage include: `src/**/*.js`
  - Coverage exclude: `src/server/web-server.js`, `src/cli/**`

- **Current Test Files (`tests/unit/`)**:
  - `tests/unit/config.test.js` (2 tests)
  - `tests/unit/csrep-crypto.test.js` (2 tests)
  - `tests/unit/maps.test.js` (2 tests)
  - `tests/unit/match-parser.test.js` (5 tests)
  - `tests/unit/notifier.test.js` (2 tests)
  - `tests/unit/storage.test.js` (4 tests)
  - Total: 6 test files, 17 tests (all passing).

### 1.2 Current Baseline Coverage Deficit
Running `npm run test:coverage` currently fails with code 1 due to missing module coverage:

| File / Subsystem | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line Ranges |
|---|---|---|---|---|---|
| **All files (Overall)** | **25.00%** | **34.38%** | **25.00%** | **25.65%** | *Fails global 80% threshold* |
| `src/api/csrep/client.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 13–63 |
| `src/api/csrep/uploader.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 10–138 |
| `src/api/faceit/client.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 6–49 |
| `src/api/faceit/downloader.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 6–81 |
| `src/browser/browser-manager.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 7–54 |
| `src/config/index.js` | 77.50% | 90.00% | 75.00% | 75.00% | Lines 21, 48–49, 56–62 |
| `src/config/schema.js` | 100.00% | 100.00% | 100.00% | 100.00% | None |
| `src/core/chunk-worker-pool.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 3–106 |
| `src/core/state-store.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 5–76 |
| `src/core/sync-orchestrator.js` | 0.00% | 0.00% | 0.00% | 0.00% | Lines 17–220 |
| `src/domain/csrep-crypto.js` | 100.00% | 100.00% | 100.00% | 100.00% | None |
| `src/domain/maps.js` | 100.00% | 100.00% | 100.00% | 100.00% | None |
| `src/domain/match-parser.js` | 84.37% | 69.56% | 100.00% | 86.66% | Lines 23, 36–39, 60 |
| `src/infrastructure/notifier.js` | 56.25% | 70.00% | 50.00% | 57.14% | Lines 17–43 |
| `src/infrastructure/process-guard.js`| 0.00% | 0.00% | 0.00% | 0.00% | Lines 7–34 |
| `src/storage/atomic-file.js` | 61.90% | 57.14% | 100.00% | 63.15% | Lines 17–18, 31, 41–45 |
| `src/storage/cookie-store.js` | 82.85% | 70.73% | 66.66% | 90.00% | Lines 10–15 |
| `src/storage/history-store.js` | 87.50% | 60.00% | 85.71% | 93.33% | Line 35 |

---

## 2. Logic Chain

### 2.1 Test Architecture Hierarchy
To satisfy R3 and achieve deterministic, fast execution without real network dependencies or UI popups, tests must be organized across three distinct tiers:

```
tests/
├── unit/                       # Pure logic, isolated components, mocked dependencies
│   ├── api/                    # FACEIT & CSREP client and uploader unit tests
│   ├── browser/                # BrowserManager lifecycle, context args, cookie sync
│   ├── config/                 # Zod validation schema and ConfigManager loading/saving
│   ├── core/                   # ChunkWorkerPool concurrency, StateStore events, SyncOrchestrator
│   ├── domain/                 # Crypto hash, Map emoji resolvers, Score/Date parsers
│   ├── infrastructure/         # XML sanitization, PowerShell Toast, Process Guard
│   └── storage/                # Atomic file I/O, RFC 6265 cookie normalization, History set
├── integration/                # Multi-component interaction with virtual HTTP & SSE
│   ├── api-pipeline.test.js    # Downloader -> ChunkWorkerPool -> CSREP Uploader flow
│   ├── server-sse.test.js      # Web Studio REST API, SSE client hydration & broadcasts
│   └── sync-flow.test.js       # Orchestrator end-to-end sync cycle with mock browser
├── e2e/                        # CLI invocation tests
│   └── cli-flags.test.js       # index.js execution with --help, --ui, --pages, --concurrency
└── helpers/                    # Shared mocks, mock Playwright objects, test fixtures
    ├── mock-browser.js         # Virtual Playwright Page & Context mock factory
    ├── mock-fetch.js           # Dynamic Fetch mock generator
    └── test-fixtures.js        # Sample CSREP match JSON, FACEIT match JSON, cookies
```

---

### 2.2 Unit Test Matrix & Specifications

#### 1. Domain Layer (`src/domain/`)
- **`csrep-crypto.test.js`**:
  - `computeCsrepSecret`:
    - Determinism: `computeCsrepSecret(str) === computeCsrepSecret(str)`.
    - Special strings: Cyrillic/non-ASCII chars, empty string, long strings (10KB+).
    - Bitwise algorithm verification against known reference vector (e.g. `'test'` -> base36 hash).
  - `generateCsrepHeaders`:
    - Generates valid UUID v4 `X-Request-ID`.
    - Generates numeric timestamp `X-Request-Timestamp` within 1s of `Date.now()`.
    - Computes `X-Request-Secret` matching `${reqId}${timestamp}`.
    - Merges and overrides `additionalHeaders`.

- **`maps.test.js`**:
  - `MAP_EMOJIS`: Map key lookup for known competitive maps (`de_mirage`, `de_dust2`, `de_inferno`, `de_ancient`, `de_anubis`, `de_nuke`, `de_vertigo`, `de_cache`, `de_train`, `de_overpass`).
  - `getMapTitle`:
    - Case insensitivity & trimming: `' DE_MIRAGE '` -> `MAP_EMOJIS.de_mirage`.
    - Unknown map formatting: `'custom_aim_v2'` -> `'🎯  CUSTOM_AIM_V2'`.
    - Edge cases: `null`, `undefined`, `''`, numbers -> `'🎯  UNKNOWN'`.

- **`match-parser.test.js`**:
  - `parseMatchScore`:
    - String formats: `'13:9'`, `'9-13'`, `' 16 : 14 '` -> `{ scoreStr: '16:14', isWin: true, team1: 16, team2: 14 }`.
    - Array formats: `[13, 9]`, `[9, 13]`, `[]`, `['13', '9']`, non-numeric elements.
    - Object formats: `{ team1: 13, team2: 9 }`, `{ a: 13, b: 9 }`, non-numeric object properties -> JSON fallback.
    - Malformed / empty inputs: `null`, `undefined`, `''`, `123`, `true` -> `{ scoreStr: '—', isWin: false, team1: 0, team2: 0 }`.
    - Ties / Draw: `'12:12'` -> `isWin: false`.
  - `formatMatchDate`:
    - Valid ISO strings: `'2026-08-20T12:00:00Z'` -> localized string.
    - Timestamps: `1755691200000`.
    - Invalid inputs: `null`, `undefined`, `''` -> `'—'`.
    - Malformed date string -> returns raw string representation without throwing.

---

#### 2. Configuration Layer (`src/config/`)
- **`schema.test.js`**:
  - `ConfigSchema` default values verification (`steamId`, `maxPages=3`, `chunkConcurrency=4`, `chunkSizeBytes=10MB`, `webPort=3333`, `webHost='127.0.0.1'`, `watchIntervalMinutes=10`).
  - Validation failures:
    - `steamId`: not 17 digits (e.g. `'123'`, `'abc'`, `'765611984346442644'` [18 digits]).
    - `maxPages`: `< 1` or `> 100` or floating point.
    - `chunkConcurrency`: `< 1` or `> 16`.
    - `chunkSizeBytes`: `< 1MB` (1048576).
    - `webPort`: `< 1024` or `> 65535`.
    - `watchIntervalMinutes`: `< 1` or `> 1440`.
  - Type coercions: String inputs for numeric fields (e.g. `"5"` -> `5`).

- **`config-manager.test.js`**:
  - `ConfigManager.load()`:
    - Reads from custom JSON path if present.
    - Environment variables override JSON values (`STEAM_ID`, `FACEIT_API_KEY`, `MAX_PAGES`, `CHUNK_CONCURRENCY`, `WEB_PORT`).
    - Handles corrupted / invalid JSON file gracefully (logs warning, falls back to Zod defaults).
  - `ConfigManager.save()`:
    - Atomically updates and persists partial config to disk with indentation.
    - Handles write errors on read-only directories gracefully.
  - `ConfigManager.applyCliArgs()`:
    - Correctly parses `--pages=10`, `--concurrency=8`, `--port=5000`, `--steam=76561198000000000`.
    - Ignores unrecognized flags without error.

---

#### 3. Storage Layer (`src/storage/`)
- **`atomic-file.test.js`**:
  - `readJsonSafe`:
    - Returns defaultValue when file does not exist.
    - Returns parsed JSON on valid file.
    - Returns defaultValue and logs warning when JSON is corrupted / syntax error.
  - `writeJsonAtomic`:
    - Creates missing parent directories recursively (`mkdirSync`).
    - Writes to temporary `.tmp.<hex>` file and executes atomic rename (`renameSync`).
    - Cleans up `.tmp` file and returns `false` when write/rename fails.

- **`cookie-store.test.js`**:
  - `CookieStore.load()` & `save()`:
    - Array validation: rejects non-array cookies on `save()`.
    - Loads stored cookies or returns `[]`.
  - `normalizeForPlaywright` (RFC 6265):
    - `__Host-` prefix: sets `url: 'https://csrep.gg'` (or `faceit.com`), `secure: true`, strips `domain`.
    - `__Secure-` prefix: sets `domain: '.csrep.gg'` (or `.faceit.com`), `secure: true`.
    - Standard cookies: sets domain to `.csrep.gg` or `.faceit.com`.
    - Filters out cookies without `name` or `value`.
    - Preserves custom `path` or defaults to `'/'`.
  - `isExpired`:
    - Returns `true` if cookies array is empty or `null`.
    - Returns `false` if `csrep-access-token` is missing or has no `exp`.
    - Returns `true` if JWT `exp` timestamp is in past or expires within 300 seconds.
    - Returns `false` if JWT `exp` is in future (> 300s).
    - Handles malformed / non-base64 JWT payloads safely without throwing.

- **`history-store.test.js`**:
  - `load()`, `has()`, `add()`, `save()`, `getAll()`, `size()`.
  - Idempotent additions (Set prevents duplicate match IDs).
  - Guards against `null`, `undefined`, empty string in `add()`.
  - Persistence across instance re-instantiation.

---

#### 4. Core & Worker Pool Layer (`src/core/`)
- **`chunk-worker-pool.test.js`**:
  - `pMap` concurrency enforcement:
    - Verify that no more than `concurrency` (e.g. 4) worker promises are executed simultaneously using active worker tracking.
  - `upload` slicing & boundary logic:
    - 25MB buffer with 10MB chunk size produces 3 chunks: `[0..10MB]`, `[10MB..20MB]`, `[20MB..25MB]`.
    - 1-byte buffer produces 1 chunk.
  - `uploadChunkWithRetry`:
    - Succeeds immediately on HTTP 200.
    - Retries on HTTP 500/503 and succeeds on 2nd or 3rd attempt.
    - Throws last error after exhausting `maxRetries` (3 attempts).
  - Progress reporting:
    - Fires `onProgressFn` with `{ completedChunks, totalChunks, percent, speedMb }`.
    - Percent increases from `0%` to `100%`.
  - Cancellation & AbortSignal:
    - AbortSignal before upload immediately throws error.
    - AbortSignal triggered during chunk upload stops subsequent chunks from executing.

- **`state-store.test.js`**:
  - Ring buffer capacity:
    - Adding 160 log messages retains only the last 150 items (`logs.length === 150`).
  - Event emissions:
    - `log` event emitted on `log()`.
    - `state` event emitted on `setStatus()`.
    - `matches_found` and `stats` events emitted on `setMatches()`.
    - `progress` event emitted on `updateProgress()`.
    - `stats` event emitted on `updateStats()`.
  - `updateMatchStatus`:
    - Correctly updates matching `csrepMatchId` in matches array.
    - Does nothing if matchId is not found.
  - `getSnapshot`:
    - Returns complete snapshot of state.

- **`sync-orchestrator.test.js`**:
  - Initialization with dependencies.
  - `scan()`:
    - Sets status to `'scanning'`, calls `csrepClient.getMissingMatches`, filters through `historyStore.has()`, updates stateStore matches, saves cookies, returns unhandled matches.
    - Handles scan error: logs error, sets status to `'idle'`, returns `[]`.
  - `uploadMatches()`:
    - Empty list returns immediately with success message.
    - Downloads match demo via `faceitDownloader`.
    - Handles skipped demo (null buffer from downloader): marks match as skipped, increments skipped count.
    - Initializes multipart upload via `csrepUploader.initMultipartUpload`.
    - Uploads chunks via `chunkWorkerPool.upload`.
    - Completes upload and links demo via `csrepUploader.completeUploadAndLink`.
    - Updates historyStore and stats.
    - Triggers `sendToast` notification on completion.
    - Pipelined preloading: match[i+1] download begins while match[i] is processing.
    - Error handling: single match failure logs error, increments failed count, and continues loop.
  - `stop()`:
    - Aborts active `AbortController`, updates stateStore to `'stopped'`.

---

#### 5. Infrastructure Layer (`src/infrastructure/`)
- **`notifier.test.js`**:
  - `sanitizeXml`:
    - Escapes `<`, `>`, `&`, `"`, `'` to `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&apos;`.
    - Handles `null`, `undefined`, empty string.
  - `sendToast`:
    - Win32 platform: mocks `execFile` (`child_process`), verifies `powershell.exe` is called with `-NoProfile`, `-NonInteractive`, `-Command` and safe PowerShell script containing sanitized, truncated title (<= 100 chars) and body (<= 200 chars).
    - Non-win32 platform: verifies `execFile` is NOT called when `process.platform !== 'win32'`.

- **`process-guard.test.js`**:
  - `registerProcessGuard`:
    - Mocks `process.on` and `process.exit`.
    - Simulating `SIGINT` or `SIGTERM` triggers `onShutdown` and calls `process.exit(0)`.
    - Re-entrance prevention: multiple signals only invoke `onShutdown` once.
    - Error inside `onShutdown` is caught and `process.exit(0)` is still executed in `finally`.
    - `unhandledRejection` and `uncaughtException` listeners are registered.

---

#### 6. API & Browser Layer (`src/api/` & `src/browser/`)
- **`faceit-client.test.js`**:
  - `getMatchDetails`:
    - 200 OK: returns match JSON data with `Authorization: Bearer <apiKey>`.
    - 401 Unauthorized: logs warning, returns `null`.
    - 404 / 500 / Network fetch error: returns `null`.
    - Missing `matchId`: returns `null`.
  - `extractDemoUrl`:
    - String demo URL: returns string.
    - Array of demo URLs: returns first item.
    - Empty array or missing property: returns `null`.
    - Null / undefined input: returns `null`.

- **`faceit-downloader.test.js`**:
  - `downloadDemo`:
    - Path 1 (API + Signed URL): `getMatchDetails` returns URL, page evaluate returns signed URL, fetch returns buffer.
    - Path 2 (DOM fallback): No signed URL, navigates to room URL, clicks download button, awaits `download` event, saves to temp file, reads buffer, unlinks temp file.
    - Path 3 (Failure): Both paths fail -> returns `null`.
    - AbortSignal support: throws when aborted.

- **`csrep-client.test.js`**:
  - `getMissingMatches`:
    - Missing `steamId` returns `[]`.
    - Mock page evaluation: iterates over pages 1..N, sends signed CSREP headers, parses `DEMO_MISSING` and `FACEIT` matches, stops on `hasNextPage: false` or `maxPages`.
    - Returns normalized match array `[{ csrepMatchId, faceitMatchId, map, date, score }]`.

- **`csrep-uploader.test.js`**:
  - `initMultipartUpload`:
    - Evaluates POST `/api/uploads/demos`, extracts `token` and `fileId`.
    - Throws error if token is missing.
  - `getPresignedUrl`:
    - Evaluates POST `/api/uploads/_presign` with `part_number`.
    - Returns presigned URL string or throws if missing.
  - `completeUploadAndLink`:
    - Evaluates POST `/api/uploads/_complete` and POST `/api/matches/${csrepMatchId}` with `demo_url`.
    - Returns final `fileId`.

- **`browser-manager.test.js`**:
  - `getContext()`:
    - Launches persistent context with `--disable-blink-features=AutomationControlled`, downloadsPath, headless setting.
    - Loads and normalizes cookies from `cookieStore`, injects them into context (`addCookies`).
  - `saveCookies()`:
    - Extracts cookies for `https://csrep.gg` and `https://www.faceit.com`, saves to `cookieStore`.
  - `close()`:
    - Saves cookies and closes context safely.

---

### 2.3 Integration Test Matrix

#### 1. Web Studio & SSE Event Stream (`tests/integration/server-sse.test.js`)
- Start `WebServer` on an ephemeral/test port (e.g. `4567`).
- **REST Endpoints**:
  - `GET /api/state` -> Returns 200 with complete `stateStore.getSnapshot()` JSON.
  - `POST /api/scan` -> Returns 200 `{ ok: true }`, verifies `orchestrator.scan()` is invoked.
  - `POST /api/start` with `{ matchIds: ['m1'] }` -> Returns 200 `{ ok: true }`, verifies filtered match upload.
  - `POST /api/upload-single` with `{ matchId: 'm1' }` -> Returns 200 `{ ok: true }`.
  - `POST /api/stop` -> Returns 200 `{ ok: true }`, verifies `orchestrator.stop()` is invoked.
  - `POST` with body > 1MB -> Request destroyed / aborted.
  - `GET /invalid-path` -> Returns 404.
- **SSE Stream (`GET /api/events`)**:
  - Client connects to `/api/events` with `Accept: text/event-stream`.
  - Client immediately receives `init` event with snapshot payload.
  - State store emits `progress` event -> SSE client receives formatted `data: {"type":"progress",...}\n\n`.
  - State store emits `log` event -> SSE client receives formatted `data: {"type":"log",...}\n\n`.
  - Disconnecting client: Server cleans up SSE client reference from `sseClients` Set.
- **Server Shutdown**:
  - `webServer.close()` closes HTTP listener and terminates open SSE responses cleanly.

#### 2. End-to-End Orchestrator Pipeline Flow (`tests/integration/sync-flow.test.js`)
- Instantiate `SyncOrchestrator` with mocked Playwright browser and mocked API fetch.
- Full scan & upload lifecycle:
  1. Scan finds 2 missing matches (`match-101`, `match-102`).
  2. `uploadMatches` downloads `match-101`, inits upload, uploads chunks (4 parallel), completes upload, adds `match-101` to `historyStore`.
  3. Preloads `match-102` concurrently.
  4. Completes `match-102`.
  5. Updates stats (`uploaded: 2`, `failed: 0`, `skipped: 0`).
  6. Sends completion toast notification.

---

### 2.4 E2E CLI Test Matrix (`tests/e2e/cli-flags.test.js`)
Using Node `child_process.execFile` or `spawn`:
- **`node index.js --help`**:
  - Exits with code 0.
  - Stdout contains usage banner, `--all`, `--pages`, `--concurrency`, `--port`, `--watch`, `--login`, `--ui`.
- **`node index.js --ui`**:
  - Starts Web Studio, prints `Web Studio доступна по адресу` or `Режим Web Studio активен`.
  - Process can be cleanly terminated via `SIGINT` (code 0).
- **`node index.js --pages=2 --concurrency=6`**:
  - Verifies custom CLI arguments are applied to configuration manager without runtime errors.

---

### 2.5 Strategy to Achieve >= 80% Coverage Across All Modules

#### Coverage Calculation Model
To achieve >= 80% lines and functions across `src/` modules:

1. **Cover High-Impact Zero-Coverage Modules**:
   - `src/core/sync-orchestrator.js` (224 lines) -> ~20% of total codebase.
   - `src/api/csrep/uploader.js` (141 lines) -> ~13% of total codebase.
   - `src/core/chunk-worker-pool.js` (109 lines) -> ~10% of total codebase.
   - `src/core/state-store.js` (86 lines) -> ~8% of total codebase.
   - `src/api/faceit/downloader.js` (84 lines) -> ~8% of total codebase.
   - `src/api/csrep/client.js` (66 lines) -> ~6% of total codebase.
   - `src/browser/browser-manager.js` (58 lines) -> ~5% of total codebase.
   - `src/api/faceit/client.js` (52 lines) -> ~5% of total codebase.
   - `src/infrastructure/process-guard.js` (37 lines) -> ~3% of total codebase.

2. **Refine Existing Partial-Coverage Modules**:
   - `src/config/index.js` (raise from 75% to 95% by covering `save()`, CLI args, corrupted file handling).
   - `src/infrastructure/notifier.js` (raise from 57% to 95% by covering win32 and non-win32 `sendToast`).
   - `src/storage/atomic-file.js` (raise from 63% to 95% by covering write error rollbacks and mkdir).
   - `src/domain/match-parser.js` (raise from 86% to 100% by covering object score fallbacks and date fallbacks).

3. **Projected Coverage**:
   - Implementing unit tests for these modules will increase line coverage from **25.65% to ~92–96%**, easily surpassing the 80% threshold!

---

## 3. Caveats

1. **Browser Binary Execution in CI/Headless**:
   - Real Playwright browser launch (`chromium.launchPersistentContext`) requires installed browser binaries and display/session access.
   - **Resolution**: Unit and integration tests must mock Playwright context and page methods (`Page.evaluate`, `Page.goto`, `Page.$`, `Page.waitForEvent`) to guarantee fast (< 2 sec), headless-independent execution on all environments (Windows, Linux, macOS, CI).
2. **Windows Toast Notification Environment**:
   - `sendToast` uses PowerShell and Windows Runtime APIs which only execute on `win32`.
   - **Resolution**: Tests must mock `process.platform` and `child_process.execFile` to verify both Windows execution and non-Windows graceful no-op behavior.
3. **Vitest Coverage Exclusions in `vitest.config.js`**:
   - `src/server/web-server.js` and `src/cli/**` are currently excluded from coverage thresholds in `vitest.config.js`. If included, adding `tests/integration/server-sse.test.js` and CLI renderer unit tests will ensure even those modules reach > 85% coverage.

---

## 4. Conclusion

1. **Current State**: The existing test suite contains 6 files and 17 passing tests, but only covers basic storage, config, and pure domain utilities, resulting in **25.65% line coverage** and causing `npm run test:coverage` to fail the 80% threshold.
2. **Missing Coverage Targets**: Core orchestration (`sync-orchestrator.js`), chunk worker pool (`chunk-worker-pool.js`), state store (`state-store.js`), API clients/uploaders (`faceit/client.js`, `faceit/downloader.js`, `csrep/client.js`, `csrep/uploader.js`), browser manager (`browser-manager.js`), and process guard (`process-guard.js`) have 0% test coverage.
3. **Solution Architecture**:
   - Implement **14 unit test suites** across `tests/unit/` covering domain, storage, core, api, browser, and infrastructure.
   - Implement **2 integration test suites** (`server-sse.test.js` and `sync-flow.test.js`).
   - Implement **1 E2E CLI test suite** (`cli-flags.test.js`).
   - Use modular test helpers (`mock-browser.js`, `mock-fetch.js`, `test-fixtures.js`) for deterministic, fast execution.
4. **Outcome**: The complete suite will provide 100% test pass rate with **> 90% line and function coverage**, fulfilling all R3 requirements and passing `npm test` and `npm run test:coverage` with exit code 0.

---

## 5. Verification Method

To independently verify the test suite, coverage, and CLI behavior, execute the following commands:

```bash
# 1. Run standard unit and integration tests
npm test

# 2. Run coverage analysis and verify thresholds (>= 80% lines/functions/statements, >= 75% branches)
npm run test:coverage

# 3. Verify CLI usage output
node index.js --help

# 4. Verify Web Studio startup
node index.js --ui
```

### Invalidation Conditions:
- `npm test` fails with unhandled promise rejections or timeout errors.
- `npm run test:coverage` reports line or function coverage below 80%.
- Real Playwright browser launches during unit tests causing hanging background processes.
- Windows-specific notification calls fail or crash on non-Windows platforms.
