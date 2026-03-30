# Phase 4: Clean Up Dead Code

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Remove IAgentLaneService, builtInAgents, old state machine, and update all references

## Files to Remove
- `src/vs/workbench/contrib/multiAgent/common/agentLaneService.ts` — interface (replaced by IChatModeService)
- `src/vs/workbench/contrib/multiAgent/common/agentLaneServiceImpl.ts` — implementation
- `src/vs/workbench/contrib/multiAgent/common/builtInAgents.ts` — hardcoded templates (→ .agent.md files)
- `src/vs/workbench/contrib/multiAgent/test/common/agentLaneService.test.ts` — tests for removed service

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts`:
  - Remove `registerSingleton(IAgentLaneService, ...)`
  - Remove `MultiAgentAutoRegisterContribution` (auto-spawn built-in)
  - Remove `MultiAgentDefaultOverrideContribution` IAgentLaneService dependency
  - Update toolbar actions to not reference IAgentLaneService

- `src/vs/workbench/contrib/multiAgent/common/orchestratorServiceImpl.ts`:
  - Replace `IAgentLaneService` with `IChatModeService` for agent discovery
  - Simplify state tracking (no 7-state machine)

- `src/vs/workbench/contrib/multiAgent/common/agentChatBridge.ts`:
  - Replace `IAgentLaneService` dependencies
  - Bridge to chat modes instead of own agents

## Dependency Chain
```
builtInAgents.ts → REMOVE
agentLaneService.ts → REMOVE
agentLaneServiceImpl.ts → REMOVE
agentChatBridge.ts → REFACTOR (remove IAgentLaneService dep)
orchestratorServiceImpl.ts → REFACTOR (use IChatModeService)
multiAgent.contribution.ts → REFACTOR (remove registrations)
agentLanesViewPane.ts → already refactored in Phase 1
agentCreationWizard.ts → already refactored in Phase 3
```

## Success Criteria
- No references to IAgentLaneService in codebase
- No builtInAgents.ts
- Compile clean
- Agent Lanes view works via IChatModeService
- Orchestrator delegates to chat modes
- Provider system untouched
