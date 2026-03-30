# Phase 3: Refactor Creation Wizard to Write .agent.md

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Agent creation wizard creates `.agent.md` files instead of JSON definitions via IAgentLaneService

## Current vs Target

| Aspect | Current | Target |
|--------|---------|--------|
| Output | `IAgentLaneService.addAgentDefinition()` → JSON storage | Write `.agent.md` file to workspace |
| Discovery | Manual registration | Auto-discovered by IPromptsService |
| UI | 5-step QuickInput | Keep same 5 steps, change output target |

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/browser/agentCreationWizard.ts`

## Implementation

### Change wizard output
```typescript
// Instead of:
this._agentLaneService.addAgentDefinition({...});

// Write .agent.md file:
const content = [
    '---',
    'mode: agent',
    `description: ${description}`,
    `model: ${modelId}`,
    'tools:',
    '  - codebase',
    '---',
    '',
    instructions,
].join('\n');

const filePath = URI.joinPath(
    workspaceFolder, '.vscode', 'agents', `${name.toLowerCase()}.agent.md`
);
await fileService.writeFile(filePath, VSBuffer.fromString(content));
```

### Inject IFileService instead of IAgentLaneService
```typescript
constructor(
    private readonly _quickInputService: IQuickInputService,
    private readonly _providerService: IMultiAgentProviderService,
    private readonly _fileService: IFileService,
    private readonly _workspaceService: IWorkspaceContextService,
) {}
```

### Simplify wizard
- Remove provider selection step (VS Code handles model→provider mapping)
- Keep: name → role → instructions → model
- Model list from ILanguageModelsService (existing models) + our provider models

## Success Criteria
- Wizard creates `.agent.md` file in workspace
- File auto-discovered by IPromptsService → appears in Chat mode picker + Agent Lanes
- No dependency on IAgentLaneService
