# Phase 2: Chat Request Pipeline Integration

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Intercept chat request pipeline to route through multi-agent providers when non-Copilot provider selected

## Key Insights (from research)
- Entry: `ChatSubmitAction.run()` → `widget.acceptInput()` → `IChatService.sendRequest()`
- `IChatSendRequestOptions` has `userSelectedModelId` — extend with `userSelectedProviderId`
- Agent routing: `chatAgentService.invokeAgent(agent.id, requestProps, ...)`
- Our `AgentChatBridge` already implements `IChatAgentImplementation.invoke()`

## Files to Modify
- `src/vs/workbench/contrib/chat/common/chatService/chatService.ts` — extend IChatSendRequestOptions
- `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts` — pass provider context
- `src/vs/workbench/contrib/multiAgent/common/agentChatBridge.ts` — read provider from request

## Implementation

### Step 1: Extend Request Options
```typescript
// chatService.ts — add to IChatSendRequestOptions
export interface IChatSendRequestOptions {
    // ... existing fields
    userSelectedProviderId?: string;  // NEW: from provider picker
}
```

### Step 2: Pass Provider to Agent
```typescript
// chatServiceImpl.ts — in sendRequest/sendRequestAsync
// When userSelectedProviderId is set and not 'copilot':
//   - Route to our multi-agent orchestrator instead of default agent
//   - Pass providerId in agent request metadata
```

### Step 3: AgentChatBridge reads provider
```typescript
// agentChatBridge.ts — in invoke()
// Read providerId from request.modelConfiguration or metadata
// Use specific provider for LLM call instead of default rotation
```

## Success Criteria
- When Copilot selected → existing flow unchanged
- When Anthropic/OpenAI/etc selected → request routes through AgentChatBridge
- Provider context available in agent invoke() call
- Streaming response works through both paths
