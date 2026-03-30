---
name: VS Code Chat Request Pipeline Analysis
description: Complete trace of chat message flow from UI to LLM response, identifying interception points for multi-provider routing
type: research
---

# Chat Request Pipeline: Complete Flow Analysis

## 1. Entry Point: Send Button Click

**File:** `src/vs/workbench/contrib/chat/browser/actions/chatExecuteActions.ts`

- **Class:** `ChatSubmitAction` (inherits `SubmitAction`)
- **Method:** `run(accessor, args)`
- **Flow:**
  1. User clicks "Send" button → triggers `ChatSubmitAction.ID = 'workbench.action.chat.submit'`
  2. `SubmitAction.run()` retrieves focused widget via `IChatWidgetService.lastFocusedWidget`
  3. Calls `widget.acceptInput(inputValue)` → delegates to chat service

---

## 2. Chat Service: Request Processing

**File:** `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts`

### Entry Method: `sendRequest()`
- **Signature:** `async sendRequest(sessionResource: URI, request: string, options?: IChatSendRequestOptions): Promise<ChatSendResult>`
- **Line:** 888
- **Responsibility:** Parse input, determine target agent/command, queue or execute

### Core Method: `_sendRequestAsync()`
- **Signature:** `private _sendRequestAsync(...): IChatSendRequestResponseState`
- **Line:** 1017
- **Key Steps:**

| Step | Code Line | Action |
|------|-----------|--------|
| 1 | 1020 | Extract `@agent` mention via `ChatRequestAgentPart` |
| 2 | 1022 | Extract `/slash` command via `ChatRequestSlashCommandPart` |
| 3 | 1025 | Determine agent: `agentPart?.agent ?? defaultAgent` |
| 4 | 1268 | Resolve final agent (after optional participant detection) |
| 5 | 1310 | **INVOKE AGENT:** `chatAgentService.invokeAgent(agent.id, requestProps, ...)` |

---

## 3. Agent Routing: Resolution Logic

**File:** `src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`

### Agent Selection Hierarchy

1. **Explicit mention:** `@agent-name` in message
2. **Participant detection:** If enabled, LLM-detected agent (via `chatAgentService.detectAgentOrCommand()`)
3. **Default agent:** `chatAgentService.getDefaultAgent(location, modeKind)` (Copilot in most cases)

### Agent Invocation: `invokeAgent()`
- **Method:** `async invokeAgent(id: string, request: IChatAgentRequest, progress, history, token)`
- **Line:** 510
- **Action:**
  ```
  const result = await data.impl.invoke(request, progress, history, token)
  ```
  Calls the agent's `invoke()` implementation (IChatAgentImplementation)

---

## 4. Model Selection & Resolution

**File:** `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts`

### Model Passed via IChatAgentRequest

- **Field:** `userSelectedModelId?: string` (line 150 in chatAgents.ts)
- **Source:** `options?.userSelectedModelId` from UI model picker
- **Config:** `modelConfiguration = languageModelsService.getModelConfiguration(modelId)` (line 1213)

### ILanguageModelsService Integration

**File:** `src/vs/workbench/contrib/chat/common/languageModels.ts`

- **Service interface:** `ILanguageModelsService` (line 349)
- **Key method:** `sendChatRequest(modelId, from, messages, options, token)`
  - Resolves provider for `modelId`
  - Routes to correct LLM provider
  - Returns streaming response (`ILanguageModelChatResponse`)

---

## 5. Multi-Agent Interception Point: AgentChatBridge

**File:** `src/vs/workbench/contrib/multiAgent/common/agentChatBridge.ts`

### Architecture

```
Chat Submit → ChatService._sendRequestAsync()
    ↓
[Agent Selected: defaultAgent || @mentioned || detected]
    ↓
chatAgentService.invokeAgent(agent.id, request, ...)
    ↓
agent.impl.invoke() ← IChatAgentImplementation.invoke()
    ↓
[INTERCEPTION POINT] AgentChatBridgeImpl._createAgentImplementation()
    ↓
ILanguageModelsService.sendChatRequest(modelId, ...)
    OR IDirectProviderClient.sendRequest(...) [fallback]
```

### AgentChatBridge Key Methods

1. **registerAgent()** (line 78)
   - Dynamically registers spawned agents as chat participants
   - Returns `IChatAgentData` with `isDynamic=true, isCore=true`
   - Registration via `chatAgentService.registerDynamicAgent(agentData, impl)`

2. **_createAgentImplementation()** (line 136)
   - Returns `IChatAgentImplementation` with `invoke()` method
   - Invokes `_sendLlmRequest()` to handle actual LLM call

3. **_sendLlmRequest()** (line 189)
   - **Provider Rotation:** `rotationService.getNextAccount(modelId, [providerIds])`
   - **Primary Path:** `_sendViaLanguageModelService(modelId)` → `ILanguageModelsService.sendChatRequest()`
   - **Fallback Path:** `directClient.sendRequest()` (for UI-added providers)
   - **Error Handling:** Rate limit detection + account rotation

---

## 6. Extension Points for Multi-Provider Routing

### A. Agent Registration Hook
- **Where:** `ChatAgentService.registerDynamicAgent()`
- **Mechanism:** Create agent with custom `IChatAgentImplementation.invoke()`
- **Use Case:** Register orchestrator or bridge agent that delegates to multi-agent system
- **Current Implementation:** `AgentChatBridgeImpl` does this for spawned agents

### B. Model Selection Hook
- **Where:** UI model picker → `IChatAgentRequest.userSelectedModelId`
- **Mechanism:** Pass `userSelectedModelId` through request to agent implementation
- **Current Routing:**
  - Resolved via `ILanguageModelsService.lookupLanguageModel(modelId)`
  - Provider matched via model's vendor ID

### C. Provider Resolution Hook (PRIMARY INTERCEPTION)
- **Where:** `ILanguageModelsService.sendChatRequest(modelId, ...)`
- **Current:** Routes to registered extension provider (e.g., GitHub Copilot)
- **Override Opportunity:**
  - Register custom `ILanguageModelChatProvider` via `registerLanguageModelProvider(vendor, provider)`
  - Intercept `sendChatRequest()` call and delegate to `AgentChatBridge`

### D. Direct HTTP Client (FALLBACK)
- **Where:** `AgentChatBridgeImpl._directClient.sendRequest()`
- **When:** `ILanguageModelsService` unavailable for modelId
- **Use:** Route to external provider accounts added via Provider UI

---

## 7. Data Flow Diagram

```
┌─────────────────────┐
│   Chat Input UI     │
│  (text + @mention)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  ChatSubmitAction.run()             │
│  → widget.acceptInput()             │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  IChatService.sendRequest()         │
│  → _sendRequestAsync()              │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Agent Resolution                   │
│  1. Check @mention                  │
│  2. Participant detection (opt)     │
│  3. Default agent (Copilot)         │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  IChatAgentService.invokeAgent()    │
│  → agent.impl.invoke(request, ...)  │
│  → Progress callback streaming      │
└──────────┬──────────────────────────┘
           │
           ├─── [Standard Agent] ─────────────┐
           │                                  │
           │ [Multi-Agent via Bridge]         │
           │                                  │
           ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│ AgentChatBridge.invoke()     │   │ Copilot.invoke()         │
│ → _sendLlmRequest()          │   │ → native Copilot flow    │
│   ├─ ILanguageModelsService │   └──────────────────────────┘
│   │  (VS Code extensions)    │
│   └─ IDirectProviderClient   │
│      (custom accounts)       │
└──────────┬───────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  LLM Response Stream                │
│  (markdownContent progress)         │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Chat UI Updates (streaming)        │
│  model.acceptResponseProgress()     │
└─────────────────────────────────────┘
```

---

## 8. Key Interception Mechanism

**To route through AgentChatBridge for multi-provider support:**

### Option 1: Register Bridge as Default Agent
```typescript
// In multiAgent.contribution.ts
const bridgeAgent: IChatAgentData = {
  id: 'chat.multiAgent',
  name: 'Multi-Agent Orchestrator',
  isDefault: true,  // ← Becomes default for Ask mode
  metadata: { /* bridge icon/desc */ },
  slashCommands: [],
  locations: [ChatAgentLocation.Panel],
  modes: [ChatModeKind.Ask],
};

// impl = AgentChatBridgeImpl creates this dynamically
chatAgentService.registerDynamicAgent(bridgeAgent, bridgeImpl);
```

### Option 2: Custom Language Model Provider
```typescript
// Register fake model ID that bridges to multi-agent
languageModelsService.registerLanguageModelProvider(
  'multi-agent-vendor',
  {
    sendChatRequest: async (modelId, messages, ...) => {
      // Delegate to AgentChatBridge._sendViaLanguageModelService()
      // or custom routing logic
    }
  }
);
```

---

## 9. Critical Code References

| Component | File | Key Method |
|-----------|------|-----------|
| Chat Submit | `chatExecuteActions.ts:54-182` | `SubmitAction.run()` |
| Chat Service | `chatServiceImpl.ts:888, 1017` | `sendRequest()`, `_sendRequestAsync()` |
| Agent Invocation | `chatAgents.ts:510` | `invokeAgent(id, request, progress, history, token)` |
| Model Resolution | `languageModels.ts:381` | `sendChatRequest(modelId, from, messages, options, token)` |
| Bridge (Multi-Agent) | `agentChatBridge.ts:78-250` | `registerAgent()`, `_sendLlmRequest()` |

---

## 10. Unresolved Questions

1. **Default agent override:** Does setting `isDefault=true` on a dynamically registered agent automatically make it default, or is there additional config needed?
2. **Agent detection priority:** If both participant detection AND explicit @mention exist, which takes precedence?
3. **Chat mode binding:** Are certain agents locked to specific modes (Ask vs. Agent vs. Edit), or is mode selection independent?
4. **Token accounting:** Where does token usage get reported for non-Copilot agents?
