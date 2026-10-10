## 2026-08-23T03:55:09Z

You are teamwork_preview_spec_miner_2 for the CSREP & FACEIT refactoring project.
Your working directory is: C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\.agents\spec_miner_2\
The project root is: C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner

Please read the authoritative user request at:
C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\.agents\ORIGINAL_REQUEST.md

Task:
Mine all requirements and design the architectural target specifications and security rules:
1. Map out all required modules under src/ per R1:
   - src/config/ (loader, Zod schema validation for all env & config vars)
   - src/domain/ (csrep-crypto.js, match-parser.js, maps.js, models.js)
   - src/storage/ (atomic-file.js, history-store.js, cookie-store.js with RFC 6265 normalizer & JWT expiry check)
   - src/browser/ (browser-manager.js for Playwright context lifecycle & anti-bot)
   - src/api/ (faceit/client.js, faceit/downloader.js, csrep/client.js, csrep/uploader.js)
   - src/core/ (state-store.js, chunk-worker-pool.js, sync-orchestrator.js, event bus)
   - src/infrastructure/ (notifier.js with XML escaping & parameterized execution, process-guard.js for graceful shutdown)
   - src/cli/ & src/server/ (CLI UI menu/renderer, Web Studio HTTP/SSE server on 127.0.0.1)
   - index.js (unified entrypoint supporting all flags)
2. Define interface contracts between all modules (signatures, parameter types, return values, errors).
3. Specify security requirements per R2:
   - .env / .env.example configuration
   - .gitignore rules (isolation of .env, cookies.*, config.json, .browser_session/, demos_temp/, uploaded_history.json)
   - Elimination of all hardcoded secrets / Steam IDs
   - XML escaping & parameterization for Windows OS toast notifications.

Write your comprehensive specification report to C:\Users\Ak417ytrfg\Documents\antigravity\focused-meitner\.agents\spec_miner_2\handoff.md and report back via send_message.
