# Master Plan: CSREP & FACEIT Refactoring & Test Implementation

## Objectives
1. Modular Architecture (`src/config/`, `src/domain/`, `src/storage/`, `src/browser/`, `src/api/`, `src/core/`, `src/infrastructure/`, `src/cli/`, `src/server/`, unified `index.js`).
2. Security & Environment Configuration (.env with Zod schema validation, .gitignore updates, 0 hardcoded secrets, XML sanitization in notifier).
3. Comprehensive Test Suite with Vitest & @vitest/coverage-v8 (>=80% lines & functions coverage across domain/util/core/storage modules, integration tests, E2E tests).
4. Functional verification (node index.js --help, node index.js --ui, graceful shutdown on SIGINT/exit).

## Phases
- **Phase 0: Survey & Mining**: 3 parallel explorers/spec miners to inspect current implementation, existing code, dependencies, and all requirement specs.
- **Phase 1: Architecture & Project Plan (`PROJECT.md`)**: Synthesize features, interface contracts, module boundaries, milestone decomposition.
- **Phase 2: Milestone Execution**:
  - M1: Config, Security, Storage & Infrastructure
  - M2: Domain Logic, CSREP Crypto, Models & API Clients
  - M3: Core Pipeline, State Store, Chunk Worker Pool & Browser Management
  - M4: CLI Renderer, Web Studio Server & Unified Entrypoint (`index.js`)
  - M5: Comprehensive Unit & Integration Test Suite + Coverage Hardening (>= 80%)
  - M6: E2E Verification & Forensic Integrity Audit
- **Phase 3: Final Verification & Sentinel Handoff**.
