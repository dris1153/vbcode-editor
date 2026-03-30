# VS Code Copilot Instructions

## Project Overview

Visual Studio Code is built with a layered architecture using TypeScript, web APIs and Electron, combining web technologies with native app capabilities. The codebase is organized into key architectural layers:

### Root Folders

- `src/`: Main TypeScript source code with unit tests in `src/vs/*/test/` folders
- `build/`: Build scripts and CI/CD tools
- `extensions/`: Built-in extensions that ship with VS Code
- `test/`: Integration tests and test infrastructure
- `scripts/`: Development and build scripts
- `resources/`: Static resources (icons, themes, etc.)
- `out/`: Compiled JavaScript output (generated during build)

### Core Architecture (`src/` folder)

- `src/vs/base/` - Foundation utilities and cross-platform abstractions
- `src/vs/platform/` - Platform services and dependency injection infrastructure
- `src/vs/editor/` - Text editor implementation with language services, syntax highlighting, and editing features
- `src/vs/workbench/` - Main application workbench for web and desktop
  - `workbench/browser/` - Core workbench UI components (parts, layout, actions)
  - `workbench/services/` - Service implementations
  - `workbench/contrib/` - Feature contributions (git, debug, search, terminal, etc.)
  - `workbench/api/` - Extension host and VS Code API implementation
- `src/vs/code/` - Electron main process specific implementation
- `src/vs/server/` - Server specific implementation
- `src/vs/sessions/` - Agent sessions window, a dedicated workbench layer for agentic workflows (sits alongside `vs/workbench`, may import from it but not vice versa)

## Copilot / Agent Quick Instructions — VBCode Editor (concise)

Purpose: Give AI coding agents the minimal, high-value knowledge to be productive in this repo.

1. Big picture

- Code is TypeScript-first and organized in layers under `src/` (notably `src/vs/base`, `src/vs/platform`, `src/vs/editor`, `src/vs/workbench`).
- `extensions/` contains built-in extensions (each with `package.json` and contribution points).
- Agent/session work lives under `src/vs/sessions` and agent-related docs in `docs/` and top-level `AGENTS.md`.

2. Quickstart: build / test / debug

- Prefer the built-in VS Code tasks: run the "VS Code - Build" task (it starts the background watch tasks: Core - Transpile, Core - Typecheck, Ext - Build).
- CLI fallbacks (Windows PowerShell):
  - Type-check main sources: `npm run compile-check-ts-native`
  - Build/compile extensions (if changing `extensions/`): run the gulp compile-extensions task (project npm scripts expose this).
  - Run tests: `.\scripts\test.bat` (unit/integration runner on Windows).

3. Project-specific conventions to follow (important)

- Use tabs for indentation. Files follow Microsoft header and coding style (open brace on same line).
- Localization: externalize user-visible strings via `vs/nls` / `nls.localize()`; use double quotes for externalized strings.
- Dependency injection: services are injected in constructors. Look at `src/vs/platform/*` for examples.
- Disposables: register immediately (use `DisposableStore`, `MutableDisposable`, `DisposableMap`) — avoid leaks.
- Avoid `any`/`unknown`; prefer concrete interfaces and types. Do not pollute global namespace with new types.

4. Integration points & patterns (where to look)

- Contributions: `src/vs/workbench/contrib/*` (e.g. `multiAgent` contributions live under `src/vs/workbench/contrib/multiAgent`).
- Extension manifest & activation: `extensions/<ext>/package.json` and `extensions/*/src`.
- Build scripts & helper tasks: `build/` and `scripts/` (see `build/gulpfile.*` for extension build flows).

5. Validation / blocking checks

- Always run the TypeScript compile/typecheck step before running tests. Compilation errors must be fixed first.
- Run `npm run valid-layers-check` for layering issues when changing module boundaries.

6. Examples to reference

- Service injection pattern: constructors in `src/vs/platform/*` and `src/vs/workbench/*`.
- Contribution example: `src/vs/workbench/contrib/multiAgent/browser/multiAgent.contribution.ts` (contributions + command registration).
- Tests: look under `src/vs/*/test/` for unit test patterns.

If anything here is unclear or you want more detail in a particular area (build internals, test harness, extension packaging, or agent/session flow), tell me which section to expand and I’ll iterate.
