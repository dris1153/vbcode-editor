# Phase 2: Wire Orchestrator to IChatModeService

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Orchestrator discovers agents via IChatModeService instead of IAgentLaneService

## Current State
- `orchestratorServiceImpl.ts` uses `_agentLaneService.getAgentDefinitions()` to find roles
- `_findOrSpawnAgent()` spawns agents via IAgentLaneService
- `_getOrCreateOrchestratorInstance()` spawns planner via IAgentLaneService

## Target State
- Orchestrator reads available roles from `IChatModeService.getModes().custom`
- Task delegation sends messages through chat modes (IChatService.sendRequest with mode selection)
- No dependency on IAgentLaneService

## Files to Modify
- `common/orchestratorServiceImpl.ts`:
  - Replace `IAgentLaneService` with `IChatModeService`
  - `_findOrSpawnAgent(role)` → find matching chat mode by name
  - `_executeSingleTask` → use `IChatService.sendRequest()` with mode context
  - Remove state transition calls (no more 7-state machine)

## Success Criteria
- Orchestrator decomposes tasks using custom agents from chat modes
- No IAgentLaneService dependency
