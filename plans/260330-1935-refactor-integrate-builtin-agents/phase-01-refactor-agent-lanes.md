# Phase 1: Refactor Agent Lanes to use IChatModeService

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Agent Lanes sidebar reads agents from VS Code's IChatModeService + IPromptsService instead of IAgentLaneService

## Current vs Target

| Aspect | Current | Target |
|--------|---------|--------|
| Data source | `IAgentLaneService.getAgentDefinitions()` | `IChatModeService.getModes()` + `IPromptsService` |
| Agent list | Hardcoded 6 built-in + custom JSON | `.agent.md` files discovered by VS Code |
| State tracking | 7-state machine per agent | Simplified: idle/active (based on chat session) |
| Sync | None — two separate lists | Single source of truth |

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/agentLanesViewPane.ts` — read from IChatModeService
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — remove auto-spawn built-in, adjust auto-register

## Implementation

### AgentLanesViewPane changes
```typescript
// Replace IAgentLaneService dependency with:
@IChatModeService private readonly _chatModeService: IChatModeService,

// In _renderContent():
// Get all chat modes (Ask, Edit, Agent, custom agents)
const modes = this._chatModeService.getModes();
const customAgents = modes.filter(m => m.kind === ChatModeKind.Agent || m.source === 'file');

// Render each custom agent as a card
for (const mode of customAgents) {
    this._renderAgentCard(grid, mode);
}
```

### Agent card data mapping
```typescript
// ChatMode → card display
{
    name: mode.label,
    role: mode.description,
    model: mode.model ?? 'Auto',
    // No state machine — just show if there's an active chat using this mode
}
```

### Remove MultiAgentAutoRegisterContribution auto-spawn
- Remove the loop that spawns 6 built-in agents at startup
- Keep the onDidChangeInstances listener for manual spawns

## Success Criteria
- Agent Lanes shows same agents as Chat mode picker
- Creating agent in Chat → appears in Agent Lanes
- Creating agent in Agent Lanes → appears in Chat mode picker
- No duplicate/disconnected agent lists
