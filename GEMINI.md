# Project Guidelines & Permissions

## Command Execution
- The user has granted full permission to run commands, scripts, tests, and builds in this workspace automatically without requiring manual confirmation prompts.
- Always execute terminal commands directly and proactively.

## Project Structure
- `cli.js`: Standalone, interactive CLI application for CSREP & FACEIT Demo Uploader.
- `package.json`: Main scripts for the CLI (`npm start`, `npm run all`, `npm run watch`, `npm run login`).
- `config.json`: Local user configuration (Steam ID, FACEIT API key, chunk concurrency).
- `cookies.json`: User session cookies, automatically maintained and updated on every cycle.
- `.browser_session/`: Chromium session cache.
