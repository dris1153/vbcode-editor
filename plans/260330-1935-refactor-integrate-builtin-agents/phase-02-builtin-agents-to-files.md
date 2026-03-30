# Phase 2: Convert Built-in Agents to .agent.md Files

## Overview
- **Priority**: P0
- **Status**: pending
- **Description**: Replace hardcoded `builtInAgents.ts` with `.agent.md` files that VS Code's IPromptsService discovers automatically

## Current vs Target

| Aspect | Current | Target |
|--------|---------|--------|
| Storage | `builtInAgents.ts` — 6 hardcoded IAgentDefinition | `.agent.md` files in project/.vscode/ or user home |
| Discovery | Manual registration at startup | Automatic via IPromptsService file watchers |
| Format | TypeScript objects | Markdown with YAML frontmatter (VS Code standard) |

## .agent.md File Format (VS Code Standard)

```markdown
---
mode: agent
tools:
  - codebase
  - terminal
model: claude-sonnet-4
description: Full-stack code implementation
---

You are an expert software engineer. Write clean, maintainable, and well-tested code.
Follow existing codebase conventions and patterns. Handle edge cases and error scenarios.
```

## Files to Create
- `.vscode/agents/planner.agent.md`
- `.vscode/agents/coder.agent.md`
- `.vscode/agents/designer.agent.md`
- `.vscode/agents/tester.agent.md`
- `.vscode/agents/reviewer.agent.md`
- `.vscode/agents/debugger.agent.md`

## Files to Remove
- `src/vs/workbench/contrib/multiAgent/common/builtInAgents.ts`

## Implementation
1. Create 6 `.agent.md` files with content from `builtInAgents.ts` system instructions
2. Map model field to provider models (VS Code resolves via ILanguageModelsService)
3. Remove `builtInAgents.ts` import from `agentLaneServiceImpl.ts`
4. Remove `_loadBuiltInAgents()` call

## Key Detail
- `model` field in `.agent.md` maps to model ID in ILanguageModelsService
- Tools (codebase, terminal, etc.) map to VS Code's built-in tool system
- IPromptsService auto-discovers files matching `*.agent.md` pattern

## Success Criteria
- 6 agent files created in `.vscode/agents/`
- IPromptsService discovers them → appear in Chat mode picker
- Agent Lanes view (after Phase 1) shows them automatically
- `builtInAgents.ts` deleted
