# Phase 3: Model List from Providers

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: When user selects a non-Copilot provider, update the model dropdown to show models from that provider

## Key Insights
- Model picker reads from `ILanguageModelsService` which lists extension-registered models
- Our `IMultiAgentProviderService.getCompatibleModels(providerId)` returns provider-specific models
- Need to inject our models into the picker when our provider is selected

## Files to Modify
- `src/vs/workbench/contrib/chat/browser/widget/input/chatModelSelectionLogic.ts` — model filtering
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — register models as language model providers

## Implementation

### Approach A: Register as Language Model Provider
```typescript
// In multiAgent.contribution.ts — register each provider's models
// as ILanguageModelChatProvider so they appear in the standard picker
// This is the cleanest integration — leverages existing model picker UI
```

### Approach B: Custom Model Filtering
```typescript
// In chatModelSelectionLogic.ts — when provider picker has selection:
//   - Filter model list to only show models compatible with selected provider
//   - Add models from IMultiAgentProviderService if not already registered
```

**Recommend Approach A** — register as language model providers, reuse existing picker.

## Success Criteria
- When "Anthropic" selected → model dropdown shows Claude Opus/Sonnet/Haiku
- When "OpenAI" selected → model dropdown shows GPT-4o/o3/etc
- When "Copilot" selected → original model list (Copilot models)
- Model changes persist across messages in same session
