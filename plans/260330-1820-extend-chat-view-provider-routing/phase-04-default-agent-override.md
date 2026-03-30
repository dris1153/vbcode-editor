# Phase 4: Default Agent Override

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: When non-Copilot provider is selected, set our orchestrator as default agent so plain messages (without @mention) route through our system

## Key Insights
- Default agent: `IChatAgentData.isDefault = true` — only one can be default
- Agent routing: `ChatServiceImpl` falls back to default agent when no @mention
- Our orchestrator registered via `registerDynamicAgent()` — can set `isDefault`

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/common/agentChatBridge.ts` — conditionally set isDefault based on provider selection

## Implementation

```typescript
// When provider picker changes to non-Copilot:
//   1. Register orchestrator agent with isDefault = true
//   2. Copilot agent's isDefault becomes false (VS Code handles single-default)
//
// When provider picker changes back to Copilot:
//   1. Unregister our default agent
//   2. Copilot resumes as default
```

### State Flow
```
Provider picker: "Copilot" → orchestrator not default → Copilot handles all
Provider picker: "Anthropic" → orchestrator isDefault=true → our system handles all
```

## Success Criteria
- Plain messages (no @mention) route through selected provider
- @mention specific agents still works
- Switching back to Copilot restores original behavior
- No conflicts between Copilot and our orchestrator
