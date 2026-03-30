---
name: VS Code Built-in Agent Customization System
description: Deep analysis of VS Code's ICustomizationHarnessService, custom agents, chat modes, and how to integrate external provider/model systems with existing infrastructure
type: reference
---

# VS Code Built-in Agent & Customization System

## Executive Summary

VS Code has a **dual-layer agent system**:

1. **Chat Modes** (`IChatModeService`): User-facing UI in chat input picker. Builtin modes are Ask/Edit/Agent. Custom agents become custom modes automatically.
2. **Chat Agents** (`IChatAgentService`): Backend registered agents that implement `IChatAgent` interface with invoke/followup handlers.

Custom agents are **NOT chat agents**—they're **chat modes** that appear in the mode picker. They're loaded by `IPromptsService` from `.agent.md` files, stored in workspace/user config, and don't require plugin registration.

---

## Architecture Overview

### Layers

```
┌─────────────────────────────────────────────────────────┐
│ User UI: Chat Input Mode Picker                         │
│ Shows: Ask | Edit | Agent | Custom Agent A | Custom B   │
└─────────────────────────────────────────────────────────┘
              ↓ (selects mode)
┌─────────────────────────────────────────────────────────┐
│ IChatModeService (chatModes.ts)                         │
│ - Manages builtin (Ask/Edit/Agent) + custom modes       │
│ - Loads custom agents from IPromptsService              │
│ - Returns IChatMode[] with metadata                     │
└─────────────────────────────────────────────────────────┘
              ↓ (provides agents for invoke)
┌─────────────────────────────────────────────────────────┐
│ IChatAgentService (chatAgents.ts)                       │
│ - Registry of registered IChatAgent plugins             │
│ - Extensions register via package.json contributions    │
│ - Not directly used by custom agents                    │
└─────────────────────────────────────────────────────────┘
              ↓ (language models)
┌─────────────────────────────────────────────────────────┐
│ ILanguageModelsService (languageModels.ts)             │
│ - Catalog of LM providers & models                      │
│ - Extensions register language models                   │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Chat Modes (`chatModes.ts`)

**File**: `src/vs/workbench/contrib/chat/common/chatModes.ts`

**Interfaces**:
- `IChatMode`: Observable properties (name, description, model, handOffs, customTools)
- `IChatModeService`: Find/list modes, listen to changes
- `BuiltinChatMode`: Ask, Edit, Agent (hardcoded)
- `CustomChatMode`: User-defined agents from `.agent.md` files

**Key Methods**:
```typescript
getModes(): { builtin: IChatMode[]; custom: IChatMode[] }
findModeById(id: string): IChatMode | undefined
findModeByName(name: string): IChatMode | undefined
```

**Storage**: Workspace storage key `chat.customModes` (caches serialized modes for performance).

---

### 2. Custom Agents (`promptsService.ts`)

**File**: `src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts`

**Interface `ICustomAgent`** (what defines a custom agent):
```typescript
{
  uri: URI                              // File location (.agent.md)
  name: string                          // Display name in picker
  description?: string                  // Tooltip text
  tools?: readonly string[]             // Tool references
  model?: readonly string[]             // LM model selections
  argumentHint?: string                 // Input hint for user
  target: Target                        // Copilot/VSCode/Claude/Undefined
  visibility: ICustomAgentVisibility    // { userInvocable, agentInvocable }
  agentInstructions: IChatModeInstructions  // Body + tool references
  handOffs?: readonly IHandOff[]        // Handoff definitions
  agents?: readonly string[]            // Subagent allow list
  source: IAgentSource                  // Where it was loaded from
}
```

**Storage Sources** (enum `PromptsStorage`):
- `local`: workspace `.agent.md` files
- `user`: user home directory config
- `extension`: registered by extensions via API
- `plugin`: third-party plugin providers

---

### 3. Customization Harness (`customizationHarnessService.ts`)

**File**: `src/vs/workbench/contrib/chat/common/customizationHarnessService.ts`

Filters what customizations are shown based on **harness** (execution environment):
- **VSCode** (Local): All sources visible. No path restrictions.
- **CLI**: Restricted to `~/.copilot`, `~/.claude`, `~/.agents` dirs.
- **Claude**: Restricted to `~/.claude` dir. Hides Prompts & Plugins sections.

**Key Method**:
```typescript
getStorageSourceFilter(type: PromptsType): IStorageSourceFilter
```

Returns which sources to include for a given customization type (agent, skill, instruction, etc.).

---

### 4. AI Customization Workspace Service

**File**: `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWorkspaceService.ts`

Orchestrates UI for creating/managing customizations. Delegates to `ICustomizationHarnessService` for filtering.

**Management Sections**:
- Agents
- Skills
- Instructions
- Prompts
- Hooks
- MCP Servers
- Plugins

---

## Data Flow: How Custom Agents Load

1. **Discovery Phase**:
   - `IPromptsService.getCustomAgents()` scans workspace/user dirs for `.agent.md` files
   - Parses headers (metadata) and body (instructions)
   - Returns `ICustomAgent[]`

2. **Mode Service Phase**:
   - `ChatModeService.refreshCustomPromptModes()` calls `getCustomAgents()`
   - Creates `CustomChatMode` instances wrapping each agent
   - Stores in `_customModeInstances` map (keyed by URI)
   - Fires `onDidChangeChatModes` event

3. **UI Phase**:
   - Mode picker queries `IChatModeService.getModes()`
   - Returns builtin + custom modes
   - User selects mode → stored in chat model
   - Agent invocation uses mode's metadata (model selection, tools, instructions)

---

## Storage Mechanism

### Custom Agent File Format

**Location**: Workspace root or user home
**Filename**: `agents/{name}.agent.md` (example)
**Format**: YAML header + markdown body

```markdown
---
name: CodeReviewer
description: Reviews pull requests
model: claude-opus
visibility:
  userInvocable: true
  agentInvocable: false
---

# Instructions
Review the provided code for bugs and style issues.
```

### Cached Modes Storage

**Key**: `chat.customModes` (workspace storage)
**Serialized as**: `IChatModeData[]` (includes URI, name, description, model, visibility, etc.)
**Purpose**: Fast startup (avoid re-parsing files)

---

## Integration Points for External Provider/Model Systems

### Option A: Extend IChatModeService (Recommended)

**Why**: Custom agents are modes, not agents. They don't register with `IChatAgentService`.

**Steps**:
1. Hook into `IPromptsService.onDidChangeCustomAgents`
2. When custom agents load, inspect their `.model` property
3. Register corresponding LM providers with `ILanguageModelsService`
4. Return model metadata matching agent's declared models

**Code Path**:
```typescript
// In your model provider service
this.promptsService.onDidChangeCustomAgents(() => {
  const agents = await this.promptsService.getCustomAgents();
  agents.forEach(agent => {
    const models = agent.model ?? [];
    // Register LM providers for each model name
    this.languageModelsService.registerModels(models);
  });
});
```

### Option B: Implement ILanguageModelsProvider

**Interface** (`languageModels.ts`):
```typescript
export interface ILanguageModelsProvider {
  readonly onDidChangeLanguageModels: Event<void>;
  provideLanguageModels(): Promise<ILanguageModelData[]>;
  getLanguageModelDescription(id: string): string | undefined;
}
```

**Steps**:
1. Implement provider in your multiAgent module
2. Register via `extensions.registerLanguageModelsProvider()`
3. Return model IDs matching custom agent `.model` fields

### Option C: Watch Harness Changes

**File**: `src/vs/workbench/contrib/chat/common/customizationHarnessService.ts`

Custom harnesses can be registered dynamically:
```typescript
const disposable = this.harnessService.registerExternalHarness(descriptor);
```

This allows filtering what customizations are visible by harness (VSCode vs CLI vs Claude).

---

## Key Files to Integrate With

| File | Purpose | Integration Point |
|------|---------|-------------------|
| `src/vs/workbench/contrib/chat/common/chatModes.ts` | Mode picker logic | Listen to custom agent changes |
| `src/vs/workbench/contrib/chat/common/promptSyntax/service/promptsService.ts` | Agent discovery & parsing | Inspect `.model`, `.tools`, `.visibility` fields |
| `src/vs/workbench/contrib/chat/common/languageModels.ts` | LM provider registry | Register models matching agent declarations |
| `src/vs/workbench/contrib/chat/common/customizationHarnessService.ts` | Harness filtering (VSCode/CLI/Claude) | Register custom harnesses if needed |
| `src/vs/workbench/contrib/chat/browser/aiCustomization/aiCustomizationWorkspaceService.ts` | UI for creating customizations | No change needed if using existing UI |

---

## Design Principles to Follow

1. **Don't duplicate registration**: Custom agents already appear in mode picker. Don't re-register as separate agents.

2. **Model matching**: When `ICustomAgent.model` declares `["claude-3-opus"]`, ensure your model provider has matching IDs.

3. **Visibility respects harness**: `ICustomAgent.visibility` controls whether agent shows in picker. Respect this in your provider.

4. **Tool resolution**: If agent declares `tools: ["web-search"]`, your provider should resolve tool IDs to actual tool implementations.

5. **Source tracking**: Preserve `ICustomAgent.source` (where agent came from) for telemetry/debugging.

---

## Integration Checklist for multiAgent Module

- [ ] Listen to `IPromptsService.onDidChangeCustomAgents()`
- [ ] Inspect each agent's `.model` property
- [ ] Register discovered models with `ILanguageModelsService`
- [ ] Implement `ILanguageModelsProvider` if adding new models
- [ ] Respect `ICustomAgent.visibility` when determining availability
- [ ] Map agent `.tools` to tool implementations in your system
- [ ] Test with both local and user-home agent files
- [ ] Handle errors gracefully (malformed agents, missing models)

---

## Unresolved Questions

1. **Tool implementation**: How does custom agent declare tool usage vs. actual tool implementation? Separate registry needed?
2. **Subagent system**: How do agents reference other agents (`.agents` field)? Through agent name or ID?
3. **Hand-off routing**: How are hand-offs between agents implemented? Via invoke chain or separate mechanism?
4. **Extension vs. local precedence**: If extension contributes agent with same name as local `.agent.md`, which wins?
