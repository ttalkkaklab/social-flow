# Iteration 1

Implemented the shared selection resolver, adapter registry/catalog projection,
plan/execute/status tools, guarded legacy routes, durable receipts and atomic episode
reservations. Existing production and speech planning consume shared contracts.
Provider SDK generation retries are disabled; interrupted submissions retain budget.
Standalone and host boundaries remain explicit. No paid generation was run.

Found during implementation tests:
- Build projection had to run before esbuild, not after it.
- Read-only tools must omit destructive/idempotent annotations.
- Seedance schema normalization reordered keys and incorrectly invalidated a saved
  plan; hashes now canonicalize object keys recursively.
- Per-cut choices predating scoped overrides must survive episode snapshots.
- Managed execution writes legacy usage events once, not on cached-result reads.

Focused routing suite: 17/17 passed; contract suite previously passed 991 tests
including the first 13 routing cases. Final complete check and independent review
are pending. Evidence logs: /tmp/whitefish-routing-new.log,
/tmp/whitefish-routing-check-final.log, /tmp/whitefish-routing-lint.log.
