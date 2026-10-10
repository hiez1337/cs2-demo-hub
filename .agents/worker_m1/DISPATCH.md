## 2026-08-23T03:58:00Z

Scope & Tasks for Milestone 1:
1. Security & Configuration:
   - `src/config/schema.js`: Purge hardcoded default SteamID (`76561198434644264`), use `z.string().default('')` or validated format, ensure validation rules conform to spec.
   - `src/config/index.js`: Ensure robust ConfigManager loading `.env` (via dotenv), merging `config.json`, applying CLI args (`--pages`, `--concurrency`, `--port`, `--steam`), and atomic `save()` method.
   - `.gitignore`: Ensure complete isolation of `.env`, `.env.*.local`, `config.json`, `cookies.json`, `cookies.txt`, `*.session.enc`, `uploaded_history.json`, `.browser_session/`, `demos_temp/`, `*.dem`, `*.dem.gz`, `*.dem.zst`, `.backup_v2/`, `coverage/`.
   - `.env.example`: Ensure all config parameters are documented with dummy defaults.
2. Storage Layer:
   - `src/storage/atomic-file.js`: Safe JSON read with default fallback on ENOENT/corrupted JSON, atomic write via temporary file `${file}.tmp.${random}` and `fs.renameSync`, recursive directory creation, error cleanup.
   - `src/storage/history-store.js`: Persistent Set-backed store for uploaded match IDs (`load()`, `has()`, `add()`, `save()`, `getAll()`, `size()`).
   - `src/storage/cookie-store.js`: Cookie store with RFC 6265 normalizer (handling `__Host-` with url/secure, `__Secure-` with secure, filtering missing names/values), and JWT expiration check (`csrep-access-token` exp timestamp check against current time + 300s window).
3. Infrastructure Layer:
   - `src/infrastructure/notifier.js`: Secure Windows Toast notification dispatch with `sanitizeXml()` escaping `<`, `>`, `&`, `"`, `'`, string truncation (title <= 100, body <= 200), and parameterized `powershell.exe` execution via `execFile`. Non-win32 platforms should safely no-op.
   - `src/infrastructure/process-guard.js`: Robust process shutdown handler (`SIGINT`, `SIGTERM`, `unhandledRejection`, `uncaughtException`) with reentrancy guard (`isShuttingDown` flag) and async cleanup callback.
4. Unit Tests:
   - Expand `tests/unit/config.test.js`, `tests/unit/storage.test.js`, `tests/unit/notifier.test.js`, and add `tests/unit/infrastructure/process-guard.test.js`.
   - Run `npx vitest run tests/unit/` to verify all M1 tests pass cleanly.
