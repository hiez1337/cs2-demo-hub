# E2E Test Infra: CSREP & FACEIT Demo Uploader

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Config Zod Validation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Zero Hardcoded Secrets | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | .gitignore Isolation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Atomic File I/O | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Upload History Store | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Cookie Store RFC 6265 | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | JWT Expiration Checker | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | Secure OS Notifier | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Process Guard | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 10 | CSREP Crypto Signing | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 11 | Match Score Parser | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 12 | Maps Metadata | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 13 | Domain Models (DTOs) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 14 | FACEIT API Client | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 15 | FACEIT Demo Downloader | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 16 | CSREP Match Scanner | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 17 | CSREP Multipart Uploader | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 18 | Chunk Worker Pool | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 19 | Central State Store | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 20 | Pipeline Sync Orchestrator | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 21 | Browser Lifecycle Manager | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 22 | Web Studio HTTP/SSE Server | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 23 | CLI Menu & Renderer | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 24 | Unified CLI Entrypoint | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`npm test`, `npm run test:coverage`)
- Test case format: Vitest standard `describe`, `it`, `expect` suites
- Directory layout:
  - `tests/unit/`: Unit tests for domain, config, storage, core, api, infra
  - `tests/integration/`: Multi-component tests (SSE server, sync flow)
  - `tests/e2e/`: CLI subprocess invocations (`node index.js --help`, `--ui`, etc.)
  - `tests/helpers/`: Mock browser factories, virtual fetch, test fixtures

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Sync Flow: Missing Match Scan -> Download -> 4x Chunk Upload -> Complete Link | F14, F15, F16, F17, F18, F19, F20 | High |
| 2 | Web Studio Lifecycle: Start Server -> Connect SSE -> Trigger Scan -> Upload Single Match -> Stop | F19, F20, F22 | High |
| 3 | CLI Interactive Mode & Help Routing | F23, F24 | Medium |
| 4 | Edge Recovery: Token Expiration -> Re-login Prompt -> Cookie Refresh | F6, F7, F21 | Medium |
| 5 | Concurrency & Abort: Cancel 4-Worker Chunk Upload Mid-Flight | F18, F19, F20 | High |

## Coverage Thresholds
- Global line coverage: >= 80%
- Global function coverage: >= 80%
- Global statement coverage: >= 80%
- Global branch coverage: >= 75%
