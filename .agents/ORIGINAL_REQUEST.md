# Original User Request

## 2026-08-23T03:54:26Z

Refactor the CSREP & FACEIT Demo Uploader project from monolithic scripts into a clean modular architecture, migrate configuration and secrets into `.env` with validation, and implement a comprehensive test suite with Vitest.

Working directory: C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner
Integrity mode: development

## Requirements

### R1. Clean Modular Architecture
Decompose monolithic `cli.js` and `playwright-uploader.js` into distinct, single-responsibility modules under `src/`:
- `src/config/`: Configuration loader and Zod schema validation.
- `src/domain/`: Pure domain logic (`csrep-crypto.js` for header signing, `match-parser.js` for score/status parsing, `maps.js` for map metadata, `models.js` for DTOs).
- `src/storage/`: Persistence helpers (`atomic-file.js`, `history-store.js`, `cookie-store.js` with RFC 6265 normalizer and JWT expiration check).
- `src/browser/`: Playwright context lifecycle management and anti-bot handling (`browser-manager.js`).
- `src/api/`: Service clients (`faceit/client.js`, `faceit/downloader.js`, `csrep/client.js`, `csrep/uploader.js`).
- `src/core/`: Event bus, state management (`state-store.js`), worker pool for chunked uploads (`chunk-worker-pool.js`), and pipeline orchestrator (`sync-orchestrator.js`).
- `src/infrastructure/`: Secure OS notification dispatcher (`notifier.js`) and graceful shutdown handler (`process-guard.js`).
- `src/cli/` & `src/server/`: CLI UI menu / renderer and Web Studio HTTP/SSE server bound securely to `127.0.0.1`.
- `index.js`: Unified entrypoint supporting all CLI flags (`--all`, `--watch`, `--login`, `--ui`, `--pages`, `--concurrency`, `--port`).

### R2. Security & Environment Configuration
- Move all environment parameters to `.env` (template in `.env.example`).
- Ensure `.gitignore` isolates secrets, cookies, browser profile caches, and dump files from version control.
- Eliminate all hardcoded API keys and Steam IDs from source files.
- Secure OS Toast notifications against command injection via XML escaping and parameterized execution.

### R3. Comprehensive Test Suite
- Implement unit tests covering pure domain logic, crypto header generation, score parsing, config schema, atomic file I/O, and chunk worker pool concurrency.
- Implement integration tests for API flows and server SSE event broadcasting.
- Configure Vitest with `@vitest/coverage-v8` enforcing coverage thresholds (>= 80% lines/functions).

## Acceptance Criteria

### Test Execution & Coverage
- [ ] `npm test` runs all tests in `tests/` and exits with code 0 without unhandled rejections.
- [ ] `npm run test:coverage` reports >= 80% line and function coverage on domain and utility modules.

### Security & Integrity
- [ ] No hardcoded secrets (API keys or Steam IDs) remain in `src/`, `cli.js`, or `index.js`.
- [ ] `.gitignore` contains rules for `.env`, `cookies.*`, `config.json`, `.browser_session/`, `demos_temp/`, `uploaded_history.json`.
- [ ] `notifier.js` correctly sanitizes XML/special characters without executing arbitrary shell scripts.

### Functional Verification
- [ ] `node index.js --help` outputs CLI usage and exits with code 0.
- [ ] `node index.js --ui` launches Web Studio on `127.0.0.1:3333` without errors.
- [ ] Graceful shutdown properly closes Playwright browser context on `SIGINT` / process exit without leaving locked session files.
