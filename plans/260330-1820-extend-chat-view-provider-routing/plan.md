---
name: Extend Chat View with Multi-Provider Routing
status: pending
priority: high
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Extend Chat View with Multi-Provider Routing

> Approach 3: Extend existing VS Code Chat view to route through multi-agent providers instead of only Copilot. Add provider picker to chat input, intercept request pipeline.

## Research Reports
- [Chat Model Picker Internals](../reports/researcher-260330-1820-chat-model-picker-internals.md)
- [Chat Request Pipeline](../reports/researcher-260330-1820-chat-request-pipeline.md)

## Architecture

```
Chat Input Bar (existing)
  ┌─────────────────────────────────────────────┐
  │ [+] [Agent ▾] [Model ▾] [Provider ▾] [Send]│  ← NEW: Provider picker
  └─────────────────────────────────────────────┘
         │           │            │
         │           │            ▼
         │           │     IMultiAgentProviderService
         │           │     → select provider + account
         │           ▼
         │     ILanguageModelsService
         │     → model from our providers OR Copilot
         ▼
  IChatService.sendRequest()
    → agent.invoke() with provider context
    → AgentChatBridge routes LLM call
```

## Phases

| # | Phase | Files | Priority | Effort |
|---|-------|-------|----------|--------|
| 1 | [Provider Picker Widget](phase-01-provider-picker-widget.md) | 2 create, 1 modify | P0 | M |
| 2 | [Chat Request Pipeline Integration](phase-02-chat-request-pipeline.md) | 3 modify | P0 | L |
| 3 | [Model List from Providers](phase-03-model-list-from-providers.md) | 2 modify | P1 | M |
| 4 | [Default Agent Override](phase-04-default-agent-override.md) | 1 modify | P1 | S |

## Key Decisions

1. **Add Provider picker** alongside existing Model picker — don't replace
2. **Extend `IChatSendRequestOptions`** with `userSelectedProviderId` field
3. **Intercept in `ChatServiceImpl.sendRequest()`** to pass provider context to agent
4. **Register our orchestrator as `isDefault` agent** when user selects non-Copilot provider
5. **Keep Copilot working** — only override when user explicitly picks our provider
6. **Model list dynamic** — when provider selected, filter models to compatible ones

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Upstream chat API changes | High | Isolate changes to minimal touchpoints |
| Break Copilot functionality | High | Provider picker defaults to "Copilot", only override on explicit selection |
| Chat widget complexity (154k LOC) | Medium | Only add new widget, don't modify existing picker logic |
