---
name: Remaining Tasks - Dead Code Cleanup + Hardening
status: pending
priority: medium
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Remaining Tasks — Dead Code Cleanup + Hardening

> Complete the multi-agent refactoring: remove dead code, add missing tests, fix known bugs

## Phases

| # | Phase | Priority | Effort | Description |
|---|-------|----------|--------|-------------|
| 1 | [Delete Dead Code](phase-01-delete-dead-code.md) | P1 | S | Remove IAgentLaneService, builtInAgents, old state machine |
| 2 | [Wire Orchestrator to IChatModeService](phase-02-orchestrator-chatmode.md) | P1 | M | Orchestrator delegates to chat modes, not IAgentLaneService |
| 3 | [Fix Known Bugs](phase-03-fix-known-bugs.md) | P1 | M | SSE cancellation, usage dedup, double Promise resolve |
| 4 | [Additional Tests](phase-04-additional-tests.md) | P2 | L | Tests for orchestrator, rotation, chat bridge |
