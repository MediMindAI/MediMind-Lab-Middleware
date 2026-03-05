# Phase 5: Queue + Retry + Auto-Reconnect

## Tasks

- [x] T059: Create `src/queue/localQueue.ts` — SQLite offline queue
- [x] T062: Create `src/queue/localQueue.test.ts` — tests for LocalQueue (12 tests)
- [x] T060: Create `src/queue/retryProcessor.ts` — retry processor
- [x] T063: Create `src/queue/retryProcessor.test.ts` — tests for RetryProcessor (8 tests)
- [x] T058: Extend `src/connections/connectionManager.ts` with auto-reconnect
- [x] T061: Extend `src/connections/connectionManager.test.ts` with reconnect tests (4 new tests)
- [x] Run all tests and verify everything passes (364/364 pass)

## Summary

All 6 files created/modified. 24 new tests added. Full suite: 37 files, 364 tests, all passing.

### What was built

1. **LocalQueue** (151 lines) — SQLite offline queue with WAL mode. Stores LabResults as JSON rows.
   Exponential backoff on retries: min(30s, 1s * 2^attempts). Prevents duplicate messages via UNIQUE
   constraint on message_id.

2. **RetryProcessor** (73 lines) — Timer-based loop that dequeues pending items, calls a sender
   function, and marks results as sent or failed. start()/stop() lifecycle.

3. **Auto-reconnect in ConnectionManager** (+74 lines) — On disconnect, schedules reconnect with
   exponential backoff (1s -> 2s -> 4s -> ... -> 30s cap). Creates a fresh connection on each
   attempt. Resets backoff on success. stopAll() cancels all pending timers.
