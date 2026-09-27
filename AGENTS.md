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
│  │   - Tier 3: Regex/Text │         │ - Selection union manager     │  │
│  │   - Workspace Scanner  │         │ - PanePipelineManager         │  │
│  └────────────────────────┘         └──────────────┬────────────────┘  │
│                                                    │ Delegates to      │
│                                                    ▼                   │
│                                     ┌───────────────────────────────┐  │
│                                     │ PaneRegistry                  │  │
│                                     │ - Modular PaneDefinition per  │  │
│                                     │   role in src/panes/          │  │
│                                     │ - Declarative capabilities    │  │
│                                     │ - Strongly typed I/O contract │  │
│                                     └──────────────┬────────────────┘  │
│                                                    │ State & Projections
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 100% Native Facet Navigation Deck (`facet-container`)            │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Native Pane 1: Directories (`facet.pane.1`)  [☲][⑂][⚙][...]│  │  │
│  │  │    [Input: Project] [Display: Hierarchy] [Selection: Cursor│  │  │
│  │  │    - 📁 src                                                 │  │  │
│  │  │      - 📁 services                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 2: Files (`facet.pane.2`)        [☲][⑂][⚙][...]│  │  │
│  │  │    [Input: Previous Pane] [Selection: Cursor]              │  │  │
│  │  │    - 📄 order.ts                                            │  │  │
│  │  │    - 📄 payment.ts                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 3: Definitions (`facet.pane.3`)  [☲][⑂][⚙][...]│  │  │
│  │  │    [Role: symbols] [Input: Previous] [Tree: No] (Flat)     │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: Members (`facet.pane.4`)      [☲][⑂][⚙][...]│  │  │
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

## 2. Core Non-Negotiable Principles

- **Exclusively Native VS Code UI (Zero Webviews, Zero HTML/DOM):** Zero webviews, zero HTML/DOM, zero web runtime overhead. Never introduce Webviews, HTML, CSS, iframe, or web rendering layers. All UI elements are 100% native standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline actions.
- **Native Drag-and-Drop Reordering & Out-of-the-Box Piping (No Move/Reorder Menu Actions):** Pane reordering is performed exclusively through native VS Code workbench drag-and-drop. No artificial menu actions, toolbar buttons, or commands for "Move Up", "Move Down", or "Reorder". Dragging and dropping panes, adding panes, and removing panes work completely out of the box, with relative upstream chaining (`previousPane`) immediately and automatically adapting the piping to the visual sequence.
- **Always-On Clarity & Navigation:** Symbol icons, contextual details (signatures, locations), and auto-reveal on click/selection are permanently enabled natively with zero toggle overhead.
- **Dynamic Native Pane Pipeline:** Up to 6 configurable native pane slots (`facet.pane.1` .. `facet.pane.6`) hosted inside the `facet-container` Activity Bar view container:
  - **Single Contextual Menu per Pane (`facet.pane.configure` `$(gear)`):** Clean, uncluttered pane headers replacing bars of individual action icons.
  - **Distinct Strongly-Typed Pane Configurations:**
    - `DirectoriesPaneConfig`: Role `directories`, glob filtering, position/name sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), display options (`tree: boolean`).
    - `FilesPaneConfig`: Role `files`, glob file filtering, position/name sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), display options (`tree: boolean` - toggles between recursive descendant traversal when `true` and 1-level direct children when `false`).
    - `SymbolsPaneConfig`: Role `symbols`, unified types and members navigator. When input is one or more files, enumerates types; when input is a type, enumerates members. Configurable tree hierarchy vs. flat list display (`tree: boolean`, default `true`), 26 symbol kind filters, position/name/category sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`).
    - `HierarchyPaneConfig`: Role `hierarchy`, type hierarchy view, selectable subclass kinds, 26 symbol kind filters, position/name/category sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), display options (`tree: boolean`).
    - `DefinitionsPaneConfig`, `DeclarationsPaneConfig`, `ImplementationsPaneConfig`, `ReferencesPaneConfig`: Dedicated symbol relation/navigation views with readable snippet previews, file paths, 26 symbol kind filters, position/name sorting, input source (`previousPane`), selection source (`all`, `none`).
    - `CallersPaneConfig`: Incoming calls with container and snippet preview, input source (`previousPane`), selection source (`all`, `none`).
    - `ProblemsPaneConfig`: Workspace/editor/active diagnostics with severity grouping, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), position/name/category sorting.
    - `ChangesPaneConfig`: Dirty and changed files, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), position/name sorting.
  - **Pipeline Settings (Adding & Removing with Drag-and-Drop Resilience):**
    - *Add Pane:* Append a new pane to the end of the pipeline sequence (up to 6 total slots).
    - *Remove Pane:* Hide this pane from the pipeline (enforcing minimum 1 visible pane), shifting subsequent slots without corrupting slot indexing or upstream references.
  - **Presets & Persistence**:
    - Predefined presets out of the box (`Project Browser`, `Active Editor`, `Working Changes`, `Problem Triage`, `Type Hierarchy`, `Open Editors`).
    - Save, load, and delete custom presets to Workspace (`facet.presets.workspace`) or Global settings (`facet.presets.global`).
    - **Predefined Presets (`facet.pane.presets`):**
      - **Project Browser:** Directories (tree: true) -> Files (tree: false) -> Definitions (symbols, tree: false) -> Members (symbols, tree: true).
      - **Active Editor:** Symbols (activeEditor, tree: true) -> Members (symbols, previousPane, tree: false) -> Callers.
      - **Working Changes:** Changes (project) -> Symbols (tree: true) -> Members (symbols, tree: false) -> Problems.
      - **Problem Triage:** Problems (project) -> Symbols (tree: true) -> Members (symbols, tree: false) -> References.
      - **Type Hierarchy:** Hierarchy (project, tree: true) -> Members (symbols, tree: false) -> Implementations.
      - **Open Editors:** Open Files (openEditors) -> Symbols (tree: true) -> Members (symbols, tree: false) -> References.
  - **Tree Display Mode**:
    - `tree: boolean`: Toggles between nested collapsible tree hierarchy (`true`) and flat item list (`false`). For the Files pane, `tree: true` enumerates recursively across subdirectories while `tree: false` displays only 1 level of files.
- **High-Readability Relations Display:**
  - Code snippet preview as label (trimmed source code line).
  - Relative workspace path and 1-based line number (`src/service.ts:42`) as description.
  - Descriptive tooltips and native Codicons (`references`, `call-incoming`, `type-hierarchy-sub`).
- **Universal Multi-Selection (`canSelectMany: true`):**
  - Selecting multiple files aggregates the union of their types in downstream panes.
  - Selecting multiple types aggregates the union of their members.
  - Selecting multiple members computes combined references, callers, definitions, declarations, or implementations.
- **Deep Cursor Tracking & Tree Sync:**
  - Cursor tracking identifies enclosing type, active member, and document URI simultaneously.
  - Synchronizes across all downstream and upstream tiers (Files -> Types -> Members), resolving exact tree references and auto-expanding hierarchical parents via `getParent()`.
- **Resilient & Non-Blocking:** In-memory caching keyed by `(uri, document.version)`, debounced background synchronization (150ms) with `CancellationTokenSource`, and tiered LSP fallbacks down to regex parsing.

---

## 3. Engineering & Code Quality Rules

- **Private Helpers at the Bottom**: Place private helper methods, fallback parsers, and internal utility functions at the bottom of classes and files so that the public API and core lifecycle methods appear clearly at the top.
- **No `any` Types**: Never use the `any` type in production code. Leverage strict types, `unknown`, explicit generics (`<T = unknown>`), type narrowing, or specific interfaces and unions instead.
- **Reusability & Duplication**: Reuse logic, types, and utility functions across modules. Refactor shared functions into utility modules (`src/shared/`). Do not duplicate path normalization, URI resolution, or filter logic across panes.
- **Nullish Coalescing (`??`) for Fallbacks**: Always use the nullish coalescing operator (`??`) when assigning default fallback values for `null` or `undefined`. Reserve `||` exclusively for boolean logical condition checks.
- **No Loose Object Records (`Record<string, any>`)**: Prefer explicit typed interfaces, `Map` / `ReadonlyMap`, and `Set` / `ReadonlySet` over generic object records.
- **Backward Compatibility Boundaries**: Do not preserve backward compatibility. Refactor directly without retaining legacy aliases or wrapper cruft. Update all consumers and tests immediately.
- **Immediate Cleanup**: Delete unused methods, properties, variables, types, and imports during refactoring. Never leave dead code behind.
- **No Inline Imports**: All imports must be declared as static top-level `import` statements at the very top of the file. Never use inline `import('...')` or dynamic `require('...')`.
- **Indentation**: Always use 2 spaces for indentation.
- **Quality Loop**: Execute `npm run format`, `npm run lint`, `npm test`, `npm run compile` (or `tsc -p ./`), ensuring zero errors before finishing tasks.
- **Commit Messages**: Human-readable title without prefixes (`feat:`, `fix:`). Only commit when explicitly requested. Never push or pull to remote repositories.
