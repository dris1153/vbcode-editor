# Phase 1: Provider Picker Widget

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Add a provider dropdown to the Chat input bar, alongside the existing Model and Agent/Mode pickers

## Key Insights (from research)
- Model picker pattern: `modelPickerActionItem.ts` (179 lines) — toolbar action item with QuickPick
- Widget registry: `ChatInputPartWidgetsRegistry` for registering new input widgets
- Chat input toolbar: `chatInputPart.ts` manages toolbar items via MenuId contributions
- Pattern: `registerAction2` with `MenuId.ChatInputSide` or similar menu

## Files to Create
- `src/vs/workbench/contrib/chat/browser/widget/input/providerPickerActionItem.ts` — Provider picker dropdown

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` — register provider picker menu action

## Implementation

### Provider Picker Widget
```typescript
// providerPickerActionItem.ts
// Follow same pattern as modelPickerActionItem.ts

class ProviderPickerActionItem extends MenuEntryActionViewItem {
    // Show QuickPick with providers from IMultiAgentProviderService
    // Options: "Copilot (default)", "Anthropic", "OpenAI", "Google AI", "OpenRouter"
    // Selection stored in chat widget state
    // When non-Copilot selected → triggers model list refresh (Phase 3)
}
```

### Menu Registration
```typescript
registerAction2(class SelectProviderAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.chat.selectProvider',
            title: 'Select AI Provider',
            menu: [{ id: MenuId.ChatInputSide, group: 'navigation', order: 0 }],
        });
    }
    run(accessor) {
        // Show QuickPick with providers
    }
});
```

## Success Criteria
- Provider dropdown visible in chat input bar
- Shows all providers from IMultiAgentProviderService + "Copilot (default)"
- Selection persisted in session
- Visual indicator of selected provider
