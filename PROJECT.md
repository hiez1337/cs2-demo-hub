# Project: CSREP & FACEIT Demo Uploader Refactoring

## Architecture
The CSREP & FACEIT Demo Uploader is refactored from legacy monolithic scripts into a clean, event-driven modular architecture under `src/`. It separates pure domain calculation, storage persistence, Playwright browser automation, API communications, concurrent chunk upload pipelines, and user interfaces (CLI + Web Studio).

```
┌────────────────────────────────────────────────────────────────────────┐
│                              index.js                                  │
│         (Unified CLI Router & Bootstrap Entrypoint - Lazy Loading)     │
└──────────────┬───────────────────────────────────────────┬─────────────┘
               │                                           │
       ┌───────▼────────┐                         ┌────────▼────────┐
       │   CLI Engine   │                         │   Web Studio    │
       │ (src/cli/menu) │                         │(src/server/web) │
       └───────┬────────┘                         └────────┬────────┘
               │                                           │
               └───────────────────┬───────────────────────┘
                                   │
                     ┌─────────────▼───────────────┐
                     │     SyncOrchestrator        │
                     │  (src/core/sync-orch.js)    │
                     └─────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
 ┌──────▼──────┐            ┌──────▼──────┐            ┌──────▼──────┐
 │ State Store │            │ Chunk Worker│            │   Browser   │
 │ & Event Bus │            │  Pool (R2)  │            │   Manager   │
 └─────────────┘            └──────┬──────┘            └──────┬──────┘
                                   │                          │
        ┌──────────────────────────┴───────────────┐          │
 ┌──────▼──────┐                            ┌──────▼──────┐   │
 │FACEIT Client│                            │CSREP Client │   │
 │& Downloader │                            │ & Uploader  │   │
 └─────────────┘                            └─────────────┘   │
        │                                          │          │
        └───────────────────┬──────────────────────┴──────────┘
                            │
               ┌────────────▼────────────┐
               │ Pure Domain & Storage   │
               │ (models, crypto, parse, │
               │  atomic-file, cookies)  │
               └─────────────────────────┘
```

## Code Layout
```
focused-meitner/
├── index.js                     # Unified CLI / Web Studio entrypoint
├── cli.js                       # Legacy interactive CLI launcher (redirects to index.js)
├── package.json                 # Dependencies, test & coverage scripts
├── vitest.config.js             # Vitest test runner configuration
├── .env.example                 # Environment configuration template
├── .gitignore                   # Version control isolation rules
├── public/                      # Static Web Studio UI assets
│   └── index.html               # Web Studio single-page interface
├── src/
│   ├── config/                  # Configuration & Zod Validation
│   │   ├── index.js             # ConfigManager (dotenv + JSON loader)
│   │   └── schema.js            # Zod validation schema
│   ├── domain/                  # Pure Domain Logic & Data Models
│   │   ├── csrep-crypto.js      # CSREP header signing hash
│   │   ├── maps.js              # Map display names & emojis
│   │   ├── match-parser.js      # Score parser & date formatter
│   │   └── models.js            # DTOs (CsrepMatch, Progress, Stats, Log)
│   ├── storage/                 # Persistence Layer
│   │   ├── atomic-file.js       # Atomic file write & safe JSON read
│   │   ├── cookie-store.js      # RFC 6265 cookies & JWT expiry checker
│   │   └── history-store.js     # Uploaded match ID set store
│   ├── browser/                 # Browser Automation
│   │   └── browser-manager.js   # Playwright context lifecycle & stealth
│   ├── api/                     # Service API Clients
│   │   ├── faceit/
│   │   │   ├── client.js        # FACEIT Open API v4 client
│   │   │   └── downloader.js    # Demo downloader (API + DOM fallback)
│   │   └── csrep/
│   │       ├── client.js        # CSREP match scanner & DOM fetch
│   │       └── uploader.js      # CSREP multipart upload & linker
│   ├── core/                    # Core Pipelines & Concurrency
│   │   ├── chunk-worker-pool.js # Parallel R2 multipart chunk worker pool
│   │   ├── state-store.js       # Central AppStateStore (EventEmitter)
│   │   └── sync-orchestrator.js # End-to-end sync coordinator
│   ├── infrastructure/          # System Infrastructure
│   │   ├── notifier.js          # Secure Windows Toast notification dispatcher
│   │   └── process-guard.js     # Graceful process shutdown handler
│   ├── cli/                     # CLI Interfaces
│   │   ├── menu.js              # Interactive CLI menu
│   │   ├── renderer.js          # Console ASCII progress renderer
│   │   └── setup-wizard.js      # Initial SteamID setup wizard
│   └── server/                  # Web Studio Server
│       └── web-server.js        # HTTP server & SSE real-time event stream
└── tests/                       # Vitest Test Suite
    ├── unit/                    # Unit test suites
    │   ├── api/
    │   ├── browser/
    │   ├── config/
    │   ├── core/
    │   ├── domain/
    │   ├── infrastructure/
    │   └── storage/
    ├── integration/             # Integration test suites
    │   ├── api-pipeline.test.js
    │   ├── server-sse.test.js
    │   └── sync-flow.test.js
    ├── e2e/                     # E2E CLI execution tests
    │   └── cli-flags.test.js
    └── helpers/                 # Test doubles & mock factories
        ├── mock-browser.js
        ├── mock-fetch.js
        └── test-fixtures.js
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Config Zod Validation | Strict validation of SteamID64, API keys, ports, concurrency | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Zero Hardcoded Secrets | Purge default SteamID from schema and isolate keys | M1 | ORIGINAL_REQUEST §R2 |
| 3 | .gitignore Isolation | Isolate .env, config.json, cookies, browser session, dumps | M1 | ORIGINAL_REQUEST §R2 |
| 4 | Atomic File I/O | Safe read & atomic write via temporary file + rename | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Upload History Store | Persistent Set tracking uploaded match IDs | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Cookie Store RFC 6265 | Cookie normalization with `__Host-` and `__Secure-` prefixes | M1 | ORIGINAL_REQUEST §R1 |
| 7 | JWT Expiration Checker | Check `csrep-access-token` exp timestamp (>300s) | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Secure OS Notifier | Windows Toast notification with XML entity sanitization | M1 | ORIGINAL_REQUEST §R2 |
| 9 | Process Guard | Graceful SIGINT/SIGTERM shutdown & resource cleanup | M1 | ORIGINAL_REQUEST §R1 |
| 10 | CSREP Crypto Signing | Pure bitwise hash calculation for `X-Request-Secret` | M2 | ORIGINAL_REQUEST §R1 |
| 11 | Match Score Parser | Score parsing from strings/arrays/objects and win/loss | M2 | ORIGINAL_REQUEST §R1 |
| 12 | Maps Metadata | Map code to display name and emoji formatting | M2 | ORIGINAL_REQUEST §R1 |
| 13 | Domain Models (DTOs) | Typed DTO interfaces (`CsrepMatch`, `Progress`, `Stats`) | M2 | ORIGINAL_REQUEST §R1 |
| 14 | FACEIT API Client | Open API v4 client for match details and demo URLs | M2 | ORIGINAL_REQUEST §R1 |
| 15 | FACEIT Demo Downloader | Demo downloader with signed URL + DOM fallback | M2 | ORIGINAL_REQUEST §R1 |
| 16 | CSREP Match Scanner | In-browser paginated fetch for DEMO_MISSING matches | M2 | ORIGINAL_REQUEST §R1 |
| 17 | CSREP Multipart Uploader | Multipart upload init, presigned part URL, and linker | M2 | ORIGINAL_REQUEST §R1 |
| 18 | Chunk Worker Pool | Parallel worker pool for R2 chunk upload with retries | M3 | ORIGINAL_REQUEST §R1 |
| 19 | Central State Store | Event-driven state manager with 150-item ring buffer | M3 | ORIGINAL_REQUEST §R1 |
| 20 | Pipeline Sync Orchestrator | Scan, pipelined download, chunk upload, link, notify | M3 | ORIGINAL_REQUEST §R1 |
| 21 | Browser Lifecycle Manager | Persistent Playwright context, stealth args, cookies | M3 | ORIGINAL_REQUEST §R1 |
| 22 | Web Studio HTTP/SSE Server | Static UI server & SSE event stream on 127.0.0.1:3333 | M4 | ORIGINAL_REQUEST §R1 |
| 23 | CLI Menu & Renderer | Interactive menu loop and ASCII progress bar renderer | M4 | ORIGINAL_REQUEST §R1 |
| 24 | Unified CLI Entrypoint | CLI router supporting --all, --watch, --login, --ui, --help | M4 | ORIGINAL_REQUEST §R1 |
| 25 | Comprehensive Unit Tests | Unit tests for domain, config, storage, core, api, infra | M5 | ORIGINAL_REQUEST §R3 |
| 26 | Integration Tests | Server SSE and sync pipeline integration tests | M5 | ORIGINAL_REQUEST §R3 |
| 27 | Coverage Hardening (>=80%) | Line & function coverage >= 80% with @vitest/coverage-v8 | M5 | ORIGINAL_REQUEST §R3 |
| 28 | E2E CLI & Security Audit | Verification of CLI flags, Web Studio, and zero secrets | M6 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Config, Security, Storage & Infra | Features 1-9: schema.js, index.js config, .gitignore, atomic-file.js, history-store.js, cookie-store.js, notifier.js, process-guard.js | none | PLANNED |
| 2 | Domain Models & Service Clients | Features 10-17: models.js, csrep-crypto.js, maps.js, match-parser.js, faceit/client.js, faceit/downloader.js, csrep/client.js, csrep/uploader.js | M1 | PLANNED |
| 3 | Core Engine & Browser Manager | Features 18-21: chunk-worker-pool.js, state-store.js, sync-orchestrator.js, browser-manager.js | M2 | PLANNED |
| 4 | Web Studio, CLI & Unified Entry | Features 22-24: public/index.html, web-server.js, menu.js, renderer.js, setup-wizard.js, index.js, cli.js | M3 | PLANNED |
| 5 | Test Suite & Coverage (>=80%) | Features 25-27: Vitest unit & integration tests, test fixtures, coverage >= 80% lines and functions | M4 | PLANNED |
| 6 | E2E Verification & Forensic Audit | Feature 28: CLI invocation tests, Web Studio boot, graceful shutdown, forensic integrity audit | M5 | PLANNED |

## Interface Contracts

### ConfigSchema (`src/config/schema.js`)
- `ConfigSchema`: Zod object schema.
- Default `steamId`: `''` (empty string, validated if provided or prompted).
- `maxPages`: int 1..100 (default: 3).
- `chunkConcurrency`: int 1..16 (default: 4).
- `chunkSizeBytes`: int >= 1048576 (default: 10485760 = 10MB).
- `webPort`: int 1024..65535 (default: 3333).
- `webHost`: string (default: '127.0.0.1').

### Domain Models (`src/domain/models.js`)
- `CsrepMatch`: `{ csrepMatchId, faceitMatchId, map, date, score, status, statusClass, statusText }`
- `MatchProgress`: `{ overallPercent, filePercent, matchTitle, speedInfo, activeMatchId, matchStatus, matchStatusClass }`
- `SyncStats`: `{ total, uploaded, skipped, failed, trafficMb }`
- `LogEntry`: `{ message, level: 'info'|'success'|'warn'|'error', time }`
- `AppSnapshot`: `{ status, config, matches, stats, currentProgress, logs }`

### Pure Domain (`src/domain/`)
- `computeCsrepSecret(str: string): string` -> deterministic base36 unsigned 32-bit hash.
- `generateCsrepHeaders(additionalHeaders?: Record<string, string>): Record<string, string>` -> headers with `X-Request-ID`, `X-Request-Timestamp`, `X-Request-Secret`.
- `parseMatchScore(score: any): { scoreStr: string, isWin: boolean, team1: number, team2: number }`
- `getMapTitle(mapName: string | null): string`

### Storage (`src/storage/`)
- `readJsonSafe<T>(filePath: string, defaultValue?: T): T`
- `writeJsonAtomic(filePath: string, data: any): boolean`
- `HistoryStore`: `load()`, `has(id)`, `add(id)`, `save()`, `getAll()`, `size()`
- `CookieStore`: `load()`, `save(cookies)`, `normalizeForPlaywright(rawCookies)`, `isExpired(cookies)`

### Infrastructure (`src/infrastructure/`)
- `sanitizeXml(str: string): string` -> escapes `<`, `>`, `&`, `"`, `'`.
- `sendToast(title: string, body: string): void` -> parameterized PowerShell dispatch on win32.
- `registerProcessGuard({ onShutdown: () => Promise<void> }): void`

### Core Concurrency (`src/core/`)
- `ChunkWorkerPool`: `upload(fileBuffer, getPresignUrlFn, onProgressFn, signal): Promise<void>`
- `AppStateStore`: inherits `EventEmitter`, methods `log()`, `setStatus()`, `setMatches()`, `updateProgress()`, `updateStats()`, `updateMatchStatus()`, `getSnapshot()`
- `SyncOrchestrator`: `scan(pages?)`, `uploadMatches(matchList)`, `stop()`
