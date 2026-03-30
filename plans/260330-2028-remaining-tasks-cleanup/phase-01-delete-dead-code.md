# Phase 1: Delete Dead Code

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Remove files and references no longer used after IChatModeService refactor

## Files to DELETE
- `src/vs/workbench/contrib/multiAgent/common/builtInAgents.ts` — replaced by .agent.md files
- `src/vs/workbench/contrib/multiAgent/test/common/agentLaneService.test.ts` — tests for removed service

## Files to MODIFY
- `multiAgent.contribution.ts`:
  - Remove `registerSingleton(IAgentLaneService, ...)`
  - Remove `import { IAgentLaneService }` and `AgentLaneServiceImpl`
  - Update AddAgentAction to NOT use IAgentLaneService (use ICommandService to run VS Code's "Configure Custom Agents" command instead)
- `agentChatBridge.ts` — remove IAgentLaneService dependency (state transitions, token tracking)
- `orchestratorServiceImpl.ts` — handled in Phase 2
- `agentCreationWizard.ts` — remove IAgentLaneService, use IFileService to write .agent.md

## Files to KEEP (still used)
- `agentLaneService.ts` — interface still imported by some files (remove imports in this phase)
- `agentLaneServiceImpl.ts` — remove after all references cleaned

## Success Criteria
- `grep -r "IAgentLaneService" src/vs/workbench/contrib/multiAgent/` returns 0 results
- `grep -r "builtInAgents" src/vs/workbench/contrib/multiAgent/` returns 0 results
- Build compiles without errors
