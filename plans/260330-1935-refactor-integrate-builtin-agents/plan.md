---
name: Refactor - Integrate with VS Code Built-in Agent System
status: pending
priority: critical
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Refactor: Integrate with VS Code Built-in Agent System

> Stop duplicating VS Code's agent system. Agent Lanes must read from `IChatModeService` + `IPromptsService` (custom agents via `.agent.md` files). Keep Provider system (new). Remove parallel agent definitions.

## Problem

Currently 3 separate agent systems exist:

| System | Source | Used by |
|--------|--------|---------|
| `IChatModeService` + `IPromptsService` | `.agent.md` files | Chat view mode picker (Agent/Ask/Plan/A/B/hii) |
| `IChatAgentService` | Extension-registered | @mention in chat |
| `IAgentLaneService` + `builtInAgents.ts` | Hardcoded + JSON storage | Agent Lanes sidebar (Planner/Coder/...) |

System 3 (ours) is **redundant**. Custom agents in Chat view and agents in sidebar are completely disconnected.

## Research
- [VS Code Built-in Agent System](../reports/researcher-260330-1931-vscode-builtin-agent-system.md)
- [Chat Model Picker Internals](../reports/researcher-260330-1820-chat-model-picker-internals.md)

## Strategy: Keep / Remove / Refactor

| Component | Action | Reason |
|-----------|--------|--------|
| `IMultiAgentProviderService` | **KEEP** | Provider management is genuinely new |
| `multiAgentProviderServiceImpl` | **KEEP** | Account CRUD, credential storage |
| `modelProviderMap` | **KEEP** | Model-provider compatibility |
| `IProviderRotationService` | **KEEP** | Rotation + quota tracking |
| `apiFormatTranslator` | **KEEP** | Format translation |
| `directProviderClient` | **KEEP** | Direct HTTP calls |
| `providerPickerService` | **KEEP** | Provider selection for chat |
| `providersViewPane` | **KEEP** | Providers sidebar view |
| `IAgentLaneService` | **REFACTOR** | Read from `IChatModeService` instead of own definitions |
| `agentLaneServiceImpl` | **REFACTOR** | Wrapper around `IChatModeService` + `IPromptsService` |
| `builtInAgents.ts` | **REMOVE** | Replace with `.agent.md` files |
| `agentCreationWizard` | **REFACTOR** | Create `.agent.md` files instead of JSON definitions |
| `agentLanesViewPane` | **REFACTOR** | Read from `IChatModeService` for agent list |
| `IOrchestratorService` | **KEEP** | Task decomposition is new |
| `agentChatBridge` | **REFACTOR** | Bridge to custom agents via modes, not own agents |

## Phases

| # | Phase | Priority | Effort | Description |
|---|-------|----------|--------|-------------|
| 1 | [Refactor Agent Lanes to use IChatModeService](phase-01-refactor-agent-lanes.md) | P0 | L | Agent Lanes reads custom agents from Chat Modes |
| 2 | [Convert built-in agents to .agent.md files](phase-02-builtin-agents-to-files.md) | P0 | M | Replace hardcoded templates with discoverable files |
| 3 | [Refactor creation wizard to write .agent.md](phase-03-refactor-wizard.md) | P1 | M | Wizard creates files instead of JSON |
| 4 | [Clean up dead code](phase-04-cleanup.md) | P1 | S | Remove IAgentLaneService, builtInAgents, old state machine |

## Architecture After Refactor

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Chat System (existing)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ IPromptsService│ │IChatModeService│ │IChatAgentService │ │
│  │ .agent.md     │ │ Ask/Edit/Agent│ │ @mention agents  │ │
│  │ custom agents │ │ + custom modes│ │                   │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │                 │                    │            │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐ │
│  │              Multi-Agent Extension Layer                │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ProviderMgr   │  │ AgentLanes   │  │ Orchestrator │ │ │
│  │  │ (NEW - keep) │  │ (REFACTORED) │  │ (keep)       │ │ │
│  │  │ accounts,    │  │ reads from   │  │ decomposes   │ │ │
│  │  │ rotation,    │  │ IChatMode    │  │ delegates to │ │ │
│  │  │ quota        │  │ Service      │  │ chat modes   │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Agent Lanes = view into IChatModeService** — not a separate data source
2. **Built-in agents = `.agent.md` files** in workspace/user home, discovered by IPromptsService
3. **Wizard creates `.agent.md` files** — user manages agents via files (VS Code native pattern)
4. **Provider system stays** — it's genuinely new functionality
5. **Orchestrator delegates to chat modes** — not to IAgentLaneService instances
6. **State machine (7-state) → simplified** — chat modes don't have lifecycle states

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing agent flow | High | Phase 1 wraps existing service, doesn't remove yet |
| `.agent.md` format changes | Medium | Follow existing IPromptsService format exactly |
| Orchestrator loses state tracking | Medium | Keep minimal state for active tasks, not agent lifecycle |
