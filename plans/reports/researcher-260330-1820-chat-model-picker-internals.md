# Chat Widget Model Picker & Agent Selector Internals Research

**Date:** 2026-03-30 | **Researcher:** Technical Analyst

## Executive Summary

VS Code's chat widget uses a **layered picker architecture** with separate components for model selection and agent/mode selection. The system is designed for extensibility via action widgets and menu contributions. **No built-in provider selector exists**—models are sourced from `ILanguageModelsService`, not from provider routing.

**Key Finding:** To add multi-provider support, you must intercept at the `userSelectedModelId` parameter in `IChatSendRequestOptions`, then bridge to `IMultiAgentProviderService` during request execution.

---

## Architecture Overview

### 1. Model Picker Flow

**Primary File:** `chatInputPart.ts` (lines 1064-1078, 2422-2435)

The chat input maintains the selected model via `_currentLanguageModel: IObservable<ILanguageModelChatMetadataAndIdentifier>`.

When user submits request:
```
ChatInputPart.sendChatRequest()
  → chatService.sendRequest(sessionResource, message, {
      userSelectedModelId: this.input.currentLanguageModel,  // Selected model ID
      location: ChatAgentLocation,
      modeInfo: this.input.currentModeInfo,
      ...
    })
```

**Extension Point:** The `userSelectedModelId` field accepts a model identifier string. Currently resolved to an `ILanguageModelChatMetadataAndIdentifier` but **no provider context is passed**.

### 2. Agent/Mode Selector

**Primary File:** `modePickerActionItem.ts` (lines 59-341)

The "Agent ▾" dropdown is implemented via `ModePickerActionItem`, which extends `ChatInputPickerActionViewItem`.

**Key Features:**
- Groups modes by category (Built-In, Custom, Policy-Disabled)
- Filters custom agents by `Target` (workspace/folder-specific)
- Supports edit/view actions for custom agents
- Reflects current `IChatMode` via observable

**Model Relation:** Modes are separate from model selection. A mode defines *how* to chat (Agent vs Ask vs Edit); a model defines *which* LLM to use.

---

## Widget Component Breakdown

### Model Picker (IActionWidgetDropdownAction)

**File:** `modelPickerActionItem.ts` (lines 28-180)

**Delegate Interface:**
```typescript
interface IModelPickerDelegate {
  readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier>;
  setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
  getModels(): ILanguageModelChatMetadataAndIdentifier[];
  useGroupedModelPicker(): boolean;
  showManageModelsAction(): boolean;
}
```

**Action Generation:** `modelDelegateToWidgetActionsProvider()` (line 51) converts delegate to dropdown actions. Each model action triggers `delegate.setModel(model)`.

**Telemetry:** Logs `chat.modelChange` event on selection (line 84).

### Mode Picker (IActionWidgetDropdownAction)

**File:** `modePickerActionItem.ts` (lines 39-341)

**Delegate Interface:**
```typescript
interface IModePickerDelegate {
  readonly currentMode: IObservable<IChatMode>;
  sessionResource: () => URI;
  customAgentTarget?: () => Target;  // Filter agents by target
}
```

**Action Generation:** Two providers:
- `actionProvider` (line 189): Standard mode list
- `actionProviderWithCustomAgentTarget` (line 163): Filters by session target

**Execution:** Calls `ToggleAgentModeActionId` command via `commandService.executeCommand()` (line 140).

---

## Chat Request Flow (Model → LLM)

**Execution Path:**

```
1. ChatWidget.submitRequest() (line 2264)
   ├─ Collects: currentModel, currentMode, attachments, variables
   └─ Calls: chatService.sendRequest()

2. ChatService.sendRequest() → ChatServiceImpl.sendRequest()
   ├─ Input: userSelectedModelId (string)
   ├─ Resolves: model via ILanguageModelsService
   └─ Routes to: Chat Agent / Mode Handler

3. ChatServiceImpl routing:
   ├─ If Agent mode → IChatAgentService.invokeAgent()
   ├─ If Edit mode → IChatEditingSession.apply()
   └─ Uses resolved model for LLM call
```

**Critical Parameter:** `IChatSendRequestOptions.userSelectedModelId` (chatService.ts line 1362)

---

## Relevant Service Interfaces

### ILanguageModelsService
- Maintains registry of available models
- No provider concept; models sourced from extensions
- `getModelConfiguration()`, `getModelConfigurationActions()`

### IMultiAgentProviderService
- **Located:** `multiAgentProviderService.ts` (lines 1-100)
- Manages AI provider definitions, accounts, quota
- **Not currently integrated** into chat request flow

### IChatSendRequestOptions
- **Located:** `chatService.ts` (lines 1360-1380)
- Defines all request metadata
- **Missing:** Provider routing field

---

## Model Selection Logic

**File:** `chatModelSelectionLogic.ts` (lines 24-100)

**Key Functions:**
- `filterModelsForSession()` — filters by session type (e.g., targeting remote agents)
- `isModelSupportedForMode()` — validates model for current mode (agent mode requires tool calling)
- `isModelValidForSession()` — checks model matches session's targeted models

**Not Used For:** Provider selection. Only validates model capability matching.

---

## Input Widget Architecture

**Registry:** `ChatInputPartWidgetsRegistry` (line 35 in `chatInputPartWidgets.ts`)

Allows context-key-driven widget registration. Pickers (model, mode, etc.) are **not** implemented via this registry but via direct `MenuItemAction` in the toolbar.

**Toolbar Location:** Input actions toolbar rendered in `chatInputPart.ts` (line ~800+)

---

## Extension Points for Provider Routing

### Option 1: Extend IChatSendRequestOptions
Add `userSelectedProviderId?: string` alongside `userSelectedModelId`.

**Pros:** Explicit, backward-compatible
**Cons:** Requires schema change, service cascade

### Option 2: Enhance Model Metadata
Add provider info to `ILanguageModelChatMetadataAndIdentifier.metadata`.

**Pros:** Minimal API changes
**Cons:** Couples provider logic to model service

### Option 3: Intercept at ChatServiceImpl
Create provider-aware model resolver before LLM invocation.

**Pros:** Centralized, zero UI changes needed
**Cons:** Hidden, hard to trace

---

## Key Files Summary

| File | Purpose | Lines |
|------|---------|-------|
| `chatInputPart.ts` | Main input controller, model state | 154k |
| `modePickerActionItem.ts` | Agent/mode dropdown UI | 341 |
| `modelPickerActionItem.ts` | Model selection dropdown UI | 179 |
| `chatModelSelectionLogic.ts` | Model filtering & validation | 100 |
| `chatService.ts` | Request interface definitions | 1500+ |
| `chatModes.ts` | Chat mode (Agent/Ask/Edit) types | 500+ |
| `multiAgentProviderService.ts` | Provider registry (unused in chat) | 100+ |

---

## Menu Contributions

**Model Picker Action Bar:** `MenuId.ChatModelPicker` (line 257 in `modePickerActionItem.ts`)
- Extensible via contributions
- Currently shows: "Manage Models" (if entitled)

**Mode Picker Action Bar:** Not discovered; modes use direct command routing

---

## Unresolved Questions

1. **How is `userSelectedModelId` resolved to actual model object?** — Likely in `ChatServiceImpl`, needs verification
2. **Where is the Agent/Mode mode command (`ToggleAgentModeActionId`) implemented?** — Not found in grep; check `chatExecuteActions.ts`
3. **Can model picker be extended via MenuId contributions?** — Design suggests yes, but no examples found
4. **Does `sessionTargetPickerActionItem` imply session-specific model routing?** — File exists (line 17 in input/) but not analyzed

---

## Recommendation

To add provider routing:

1. **Create new action item:** `providerPickerActionItem.ts` (parallel to `modelPickerActionItem.ts`)
2. **Add to toolbar:** Register in `chatInputPart.ts` toolbar builder
3. **Extend options:** Add `userSelectedProviderId` to `IChatSendRequestOptions`
4. **Implement resolver:** In `ChatServiceImpl.sendRequest()`, resolve both model and provider, then call `IMultiAgentProviderService` to get provider account
5. **Pass to agent:** Inject provider account into agent invocation context

**Critical:** Verify that `ChatServiceImpl.sendRequest()` is the right integration point by checking how it currently routes to agents.
