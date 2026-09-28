# AGENTS.md — Facet Architecture & Implementation Guide

## 1. Product Vision & Architecture Overview

**Facet** is a modular, high-performance code navigation deck built **100% natively for Visual Studio Code**. It organizes workspaces, files, and code structures into configurable, reactive pipelines of native views without web runtime overhead.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        VS Code Host Environment                        │
│                                                                        │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   LSP Engines / Parser │         │ FacetCoordinator              │  │
│  │   - Tier 1: Tree LSP   │◄───────►│ - Debounced background sync   │  │
│  │   - Tier 2: Flat LSP   │         │ - Document version cache      │  │
│  │   - Tier 3: Regex AST  │         │ - Selection union manager     │  │
│  │   - Workspace Scanner  │         │ - Caret tracking & auto-reveal│  │
│  └────────────────────────┘         └──────────────┬────────────────┘  │
│                                                    │ Controls          │
│                                                    ▼                   │
│                                     ┌───────────────────────────────┐  │
│                                     │ PanePipelineManager           │  │
│                                     │ - 6 Native View Slots         │  │
│                                     │ - Relative Upstream Piping    │  │
│                                     │ - Pinning & Cascading Lock    │  │
│                                     │ - Presets & Persistence       │  │
│                                     └──────────────┬────────────────┘  │
│                                                    │ Delegates to      │
│                                                    ▼                   │
│                                     ┌───────────────────────────────┐  │
│                                     │ PaneRegistry                  │  │
│                                     │ - 11 Modular Pane Definitions │  │
│                                     │ - Declarative capabilities    │  │
│                                     │ - Strongly typed I/O contract │  │
│                                     └──────────────┬────────────────┘  │
│                                                    │ State & Projections
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 100% Native Facet Navigation Deck (`facet-container`)            │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Native Pane 1: Directories (`facet.pane.1`) [☲][📌][⚙][...] │  │  │
│  │  │    [Role: directories] [Input: Project] [Tree: Yes]        │  │  │
│  │  │    - 📁 src                                                 │  │  │
│  │  │      - 📁 services                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 2: Files (`facet.pane.2`)       [☲][📌][⚙][...] │  │  │
│  │  │    [Role: files] [Input: Previous] [Tree: No]              │  │  │
│  │  │    - 📄 order.ts                                            │  │  │
│  │  │    - 📄 payment.ts                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 3: Definitions (`facet.pane.3`) [☲][📌][⚙][...] │  │  │
│  │  │    [Role: symbols] [Input: Previous] [Tree: No] (Flat)     │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: Members (`facet.pane.4`)     [☲][📌][⚙][...] │  │  │
│  │  │    [Role: symbols] [Input: Previous] [Tree: Yes]           │  │  │
│  │  │    - #processPayment()                                     │  │  │
│  │  │    - #validateOrder()                                      │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    ▲                                   │
│                                    │ Reveals / Focuses                 │
│                                    ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Standard VS Code Text Editors (TypeScript, Dart, Go, Python, ...)│  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

- **Exclusively Native VS Code UI (Zero Webviews, Zero HTML/DOM):** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are 100% native standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline actions.
- **Dynamic Native Pane Pipeline (Up to 6 Slots):** Hosts up to 6 configurable native pane slots (`facet.pane.1` .. `facet.pane.6`) within the `facet-container` Activity Bar view container.
  - Adding a pane appends a slot to the end of the deck (maximum 6).
  - Removing a pane hides the slot and shifts subsequent slots without corrupting slot indexing (enforcing a minimum of 1 visible pane).
- **Native Drag-and-Drop Reordering & Relative Upstream Piping:** Pane reordering is performed exclusively through native VS Code workbench drag-and-drop. `WorkbenchLayoutWatcher` monitors the internal workbench SQLite storage (`state.vscdb`, `state.vscdb-wal`) in real time, detecting visual layout order changes and updating `PanePipelineManager`. Downstream panes with `inputSource: 'previousPane'` automatically resolve their input strictly relative to the immediately preceding visible pane.
- **Pinning Subsystem & Cascading Locks:** Any pane can be pinned using the `$(pin)` / `$(pinned)` header action or Command Palette (`facet.togglePin`, `facet.pinPane`, `facet.unpinPane`).
  - `BasePaneConfig.pinned?: boolean`: Indicates whether the pane is frozen against cursor changes.
  - `BasePaneConfig.pinnedUri?: string`: For panes with `inputSource: 'activeEditor'`, preserves the exact document URI active when pinned, insulating the pane from active editor tab switches.
  - **Cascading Lock:** Pinning a pane automatically cascades `pinned: true` to all downstream panes configured with `inputSource: 'previousPane'`. Unpinning unlocks all dependent downstream panes and triggers an immediate synchronization with the active editor.
  - Published Context Keys: `facet.pane.{N}.isPinned` powers dynamic toggle icon display (`$(pin)` when unpinned, `$(pinned)` when pinned).
- **Universal Multi-Selection Aggregation (`canSelectMany: true`):**
  - **Tier 1 (Directories ➔ Files):** Selecting multiple folders aggregates all contained files in the downstream Files pane.
  - **Tier 2 (Files ➔ Types):** Selecting multiple files aggregates the union of all declared types in the downstream Definitions/Symbols pane.
  - **Tier 3 (Types ➔ Members):** Selecting multiple types aggregates the union of all their member declarations (methods, properties, fields) in the Members pane, with smart deduplication.
  - **Tier 4 (Members ➔ Relations):** Selecting multiple members computes the combined union of references, callers, definitions, declarations, or implementations simultaneously.
  - **Multi-Selection Caret Protection:** When a user selects 2 or more items in a pane, automated cursor tracking skips updating that pane, preventing caret movements in editors from destroying multi-selections.
- **Deep Cursor Tracking & Tree Sync:** Caret tracking simultaneously locates the enclosing type, active member, and document URI. It resolves exact tree references and auto-expands hierarchical parent nodes via `getParent()`. Debounced at 150ms with `CancellationTokenSource` and redundancy guards (`isSameSlotItem`) to prevent view jitter.
- **Tiered LSP & Fallback Parsing:**
  - **Tier 1:** Standard VS Code `DocumentSymbol` hierarchical outline.
  - **Tier 2:** Flat `SymbolInformation` container query.
  - **Tier 3:** Regex AST fallback parser extracting classes, interfaces, enums, structs, constructors, methods, and properties if language servers are unavailable or files have syntax errors.
  - **Workspace Fallback:** Direct regex scanning of up to 200 project files when workspace symbol queries return empty.

---

## 3. The 11 Modular Pane Roles

All panes implement the strongly typed `PaneDefinition` contract in `src/panes/paneDefinition.ts` and are registered in `PaneRegistry`:

| Role Name | Configuration Interface | Input Sources | Display Modes | Description |
| :--- | :--- | :--- | :--- | :--- |
| `directories` | `DirectoriesPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree (`true`), Flat (`false`) | Navigates workspace directories with glob exclusions and name/position sorting. |
| `files` | `FilesPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Descendant Tree (`true`), 1-Level Children (`false`) | Navigates files. When `tree: true`, enumerates recursively across descendants; when `false`, shows direct children. |
| `symbols` | `SymbolsPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree (`true`), Flat (`false`) | Structural type and member outline navigator. Adapts based on input: files input yields types; type input yields members. 26 symbol kind filters. |
| `hierarchy` | `HierarchyPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree (`true`), Flat (`false`) | Type inheritance explorer displaying superclasses and recursive subtypes with cycle detection and subclass type filters (class, interface, struct, enum). |
| `definitions` | `DefinitionsPaneConfig` | `previousPane` | Flat list with snippet preview | Relation target finder resolving Go to Definition targets via `vscode.executeDefinitionProvider`. |
| `declarations` | `DeclarationsPaneConfig` | `previousPane` | Flat list with snippet preview | Relation target finder resolving Go to Declaration targets via `vscode.executeDeclarationProvider`. |
| `implementations` | `ImplementationsPaneConfig` | `previousPane` | Flat list with snippet preview | Relation target finder resolving interface/abstract method implementations via `vscode.executeImplementationProvider`. |
| `references` | `ReferencesPaneConfig` | `previousPane` | Flat list with snippet preview | Relation target finder resolving all workspace symbol usages via `vscode.executeReferenceProvider`. |
| `callers` | `CallersPaneConfig` | `previousPane` | Flat list with snippet preview | Relation target finder resolving incoming call hierarchies via `vscode.prepareCallHierarchy` / `vscode.provideIncomingCalls`. |
| `problems` | `ProblemsPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Flat list grouped by severity | Diagnostics navigator displaying workspace or editor compiler and linter errors/warnings. |
| `changes` | `ChangesPaneConfig` | `project`, `openEditors`, `activeEditor`, `previousPane` | Flat list | Changed files inspector showing dirty in-memory editor buffers and Git working tree / index modifications. |

### Architectural Clarification: `'symbols'` vs `'definitions'`

- **`role: 'symbols'` (Structural Outline):** Extracts the structural AST hierarchy declared inside the source file (e.g., classes, interfaces, enums, methods, properties). In standard presets (such as `Project Browser`), the pane titled "Definitions" runs `role: 'symbols'` with `tree: false` to list top-level types.
- **`role: 'definitions'` (Relation Target Finder):** Executes an LSP Go to Definition query (`vscode.executeDefinitionProvider`) on the upstream selected symbol, locating where that symbol is defined across the entire workspace and rendering code snippet previews with `path:line` locations.

---

## 4. Presets & Configuration Persistence

### Built-in Presets (`facet.applyPreset` / `facet.pane.presets`)

Facet provides 6 official built-in workflow presets:

1. **Project Browser:** `Directories (tree: true)` ➔ `Files (tree: false)` ➔ `Definitions (symbols, tree: false)` ➔ `Members (symbols, tree: true)`
2. **Active Editor:** `Symbols (activeEditor, tree: true)` ➔ `Members (symbols, previousPane, tree: false)` ➔ `Callers (previousPane)`
3. **Working Changes:** `Changes (project)` ➔ `Symbols (tree: true)` ➔ `Members (symbols, tree: false)` ➔ `Problems (project)`
4. **Problem Triage:** `Problems (project)` ➔ `Symbols (tree: true)` ➔ `Members (symbols, tree: false)` ➔ `References (previousPane)`
5. **Type Hierarchy:** `Hierarchy (project, tree: true)` ➔ `Members (symbols, tree: false)` ➔ `Implementations (previousPane)`
6. **Open Editors:** `Open Files (openEditors)` ➔ `Symbols (tree: true)` ➔ `Members (symbols, tree: false)` ➔ `References (previousPane)`

### Custom Presets Persistence

Custom pipeline layouts can be saved, loaded, and deleted via Command Palette or the presets menu:
- `facet.savePreset`: Prompts for preset name and target scope (`workspace` or `global`).
- `facet.loadPreset`: Loads a saved preset from workspace or global settings.
- `facet.deletePreset`: Deletes a saved preset from workspace or global settings.
- **Persistence Storage Schema:**
  - `facet.presets.workspace`: Record mapping preset names to `PaneConfig[]` in workspace `.vscode/settings.json`.
  - `facet.presets.global`: Record mapping preset names to `PaneConfig[]` in global user settings.

---

## 5. UI Controls, Menus & Context Keys

### Pane Header Controls (`view/title`)
Each slot `facet.pane.{N}` publishes contextual header buttons controlled by published context keys:
- `$(list-tree)` / `$(list-flat)` (`facet.pane.{N}.toggleTree.on` / `facet.pane.{N}.toggleTree.off`): Toggles tree vs flat display mode.
- `$(pin)` / `$(pinned)` (`facet.pane.{N}.togglePin.on` / `facet.pane.{N}.togglePin.off`): Toggles pinning lock.
- `$(filter)` (`facet.pane.{N}.filter`): Opens QuickPick to configure glob filters or 26 symbol kind filters.
- `$(gear)` (`facet.pane.{N}.configure`): Opens full configuration menu for the pane.
- `$(symbol-class)` (`facet.pane.{N}.type`): Switches pane role across the 11 modular types.
- `$(sign-in)` (`facet.pane.{N}.input`): Switches input source (`project`, `openEditors`, `activeEditor`, `previousPane`).
- `$(sort-precedence)` (`facet.pane.{N}.sort`): Changes sort ordering (`position`, `name`, `category`).

### View Container Header Controls (`viewContainer/title`)
The `facet-container` Activity Bar view container title exposes primary deck navigation actions:
- `$(layers)` (`facet.pane.presets`, group: `navigation@1`): Apply Preset...
- `$(add)` (`facet.addPane`, group: `navigation@2`): Add Pane
- `$(target)` (`facet.selectAtCursorAndFocus`, group: `navigation@3`): Select at Cursor and Focus
- `$(layout-sidebar-left)` (`facet.focus`, group: `navigation@4`): Focus Deck

### Published Context Keys
Synchronized on every state change via `syncContextKeys()`:
- `facet.pane.{N}.visible`: Visibility state of slot $N \in \{1..6\}$.
- `facet.pane.{N}.hasTree`: Whether slot $N$ supports tree display mode.
- `facet.pane.{N}.isTree`: Whether slot $N$ is currently in tree mode.
- `facet.pane.{N}.hasFilter`: Whether slot $N$ supports filtering.
- `facet.pane.{N}.isPinned`: Whether slot $N$ is currently pinned.
- `facet.role.{role}.visible`: Published for all 11 roles to allow role-specific menu conditions.

---

## 6. Test Architecture

The test suite runs 141 comprehensive Mocha unit tests under Node.js without requiring an Electron window.

- **Mock VS Code Environment (`src/test/unit/mockVscode.ts`):**
  - High-fidelity mock implementing `vscode.Uri` (including `Uri.file`, `Uri.parse`, and `Uri.joinPath`), `vscode.Range`, `vscode.Position`, `vscode.Location`, `vscode.Diagnostic`, `vscode.ThemeIcon`, `vscode.TreeItem`, `vscode.EventEmitter`, `vscode.commands`, `vscode.workspace`, `vscode.window`, and `vscode.languages`.
  - Realistic `TextEditorRevealType` enum (`Default = 0`, `InCenter = 1`, `InCenterIfOutsideViewport = 2`, `AtTop = 3`).
  - **State Isolation via `resetMockState()`:** Registered in test teardown hooks to reset mocked open text documents, active editor, registered commands, and event listeners between test cases, preventing cross-test pollution and race conditions.
- **Coverage Areas:**
  - Pipeline management, dynamic slot allocation, reordering, and slot deletion.
  - Cascading pinning, `pinnedUri` lifecycle, and active editor tab isolation.
  - Rapid cursor event debouncing (150ms coalescing) and cancellation tokens.
  - Multi-selection aggregation across all 4 tiers (Directories ➔ Files ➔ Types ➔ Members ➔ Relations).
  - Custom preset persistence (saving, loading, deleting across workspace and global scopes).
  - Type hierarchy cycle detection, interface/class separation, and subtype filtering.
  - Tier 1, 2, and 3 symbol parsing and regex AST fallback parsing.

---

## 7. Engineering & Code Quality Standards

- **Zero `any` Types:** Never use the `any` type in production code under `src/`. Leverage strict types, `unknown`, explicit generics (`<T = unknown>`), type narrowing, or specific interfaces and unions.
- **Private Helpers at the Bottom:** Place private helper methods, fallback parsers, and internal utility functions at the bottom of classes and files so public APIs and core lifecycle methods remain clearly visible at the top.
- **Nullish Coalescing (`??`) for Fallbacks:** Always use the nullish coalescing operator (`??`) when assigning default fallback values for `null` or `undefined`. Reserve `||` exclusively for boolean logical condition checks.
- **No Loose Object Records (`Record<string, any>`):** Prefer explicit typed interfaces, `Map` / `ReadonlyMap`, and `Set` / `ReadonlySet` over loose generic records.
- **No Obsolete Wrappers or Backward-Compatibility Workarounds:** Refactor directly without retaining legacy aliases or dead code wrappers.
- **No Inline Imports:** All imports must be declared as static top-level `import` statements at the very top of the file.
- **Indentation:** Always use 2 spaces for indentation.
- **Quality Gates:** Every change must pass:
  1. `npm run compile` (TypeScript compilation with zero errors)
  2. `npm run lint` (ESLint with zero errors or warnings)
  3. `npm run check` (Biome checks with zero errors)
  4. `npm test` (Mocha unit test suite with 100% pass rate)
- **Commit Messages:** Human-readable title without prefixes (`feat:`, `fix:`). Only commit when explicitly requested.
