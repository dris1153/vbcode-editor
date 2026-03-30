# Phase 4: Additional Tests

## Overview
- **Priority**: P2
- **Status**: pending
- **Description**: Add tests for untested services (orchestrator, rotation, chat bridge)

## Test Files to Create
- `test/common/providerRotationService.test.ts` (~10 tests)
  - Priority strategy, round-robin, cost-optimized
  - Exhausted account skipping, auto-refresh
  - Usage stats aggregation

- `test/common/orchestratorService.test.ts` (~8 tests)
  - Task submission, default decomposition
  - Dependency scheduling, cancellation
  - Failed dependency propagation

## Current Coverage: 3/13 files tested (23%)
## Target Coverage: 5/13 files tested (38%)

## Success Criteria
- All new tests pass
- No regressions in existing tests
