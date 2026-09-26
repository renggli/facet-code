<div align="center">

<img src="media/facet-logo.png" alt="Facet Logo" width="128" height="128" />

# Facet

**A structural, configurable code navigation deck built 100% natively for Visual Studio Code.**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)
[![VS Code](https://img.shields.io/badge/VS%20Code-^1.138.0-orange.svg)](https://code.visualstudio.com/)

[Features](#features) • [Workflow Presets](#workflow-presets) • [Pane Roles](#pane-roles) • [Controls & Commands](#controls--commands) • [Architecture](#architecture)

</div>

---

## Overview

**Facet** transforms your Visual Studio Code sidebar into a dynamic, multi-tier code navigation deck. Inspired by Smalltalk system browsers, Eclipse perspectives, and modern column-based explorers, Facet links directory structures, source files, type definitions, member declarations, and symbol relations into an interactive, piped navigation stream.

### Why Facet?

- **100% Native UI (Zero Webviews):** Built exclusively on native `vscode.TreeView` components. Instant rendering, zero HTML/DOM runtime overhead, native keyboard navigation, Codicons, badges, and themes.
- **Dynamic Piping & Auto-Chaining:** Each pane automatically adapts its input to the active selection or cursor position of preceding visible panes.
- **Drag-and-Drop Resilient:** Reorder panes freely in the VS Code sidebar via native workbench drag-and-drop. Upstream and downstream pipelines automatically re-anchor to the visual order.
- **Deep Cursor Tracking:** Move your cursor in any editor—Facet simultaneously resolves and highlights the enclosing file, type, and member, expanding parents automatically.
- **Universal Multi-Selection:** Select multiple files to aggregate their types; select multiple types to inspect their union of members; select multiple members to inspect combined references or callers.

---

## Features

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Facet Navigation Deck (Sidebar Container)                               │
├─────────────────────────────────────────────────────────────────────────┤
│ 📁 Directories  [🌲] [⚡] [⚙]                                           │
│   ▸ src/coordinator                                                     │
│   ▾ src/models                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ 📄 Files        [🌲] [⚡] [⚙] (Input: Previous Pane)                     │
│   • paneConfig.ts                                                       │
│   • symbolNode.ts                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ 🔷 Types        [🌲] [⚡] [⚙] (Input: Previous Pane)                     │
│   ▾ interface PaneConfig                                                │
│   • class FacetCoordinator                                              │
├─────────────────────────────────────────────────────────────────────────┤
│ 🔸 Members      [🌲] [⚡] [⚙] (Input: Previous Pane)                     │
│   • #getSlotChildren()                                                  │
│   • #handleSlotSelection()                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Interactive Symbol Relations:** Trace incoming callers, implementations, definitions, declarations, and usages with formatted code previews, relative paths, and line numbers.
- **Diagnostic & Change Awareness:** Dedicated roles for triaging workspace diagnostics (errors/warnings) and inspecting uncommitted Git changes or dirty files.
- **Custom Display Modes:** Toggle directories and files between `current` (immediate children), `flat` (recursive flat list), or `hierarchy` (nested trees).
- **Symbol Filtering:** Filter by 26 LSP symbol kinds or custom glob patterns directly from pane headers.

---

## Workflow Presets

Facet ships with six specialized workflow presets out of the box. Switch presets anytime via the Command Palette (`Facet: Apply Preset...`).

| Preset | Pipeline Flow | Best For |
| :--- | :--- | :--- |
| **Project Browser** | `Directories` ➔ `Files` ➔ `Types` ➔ `Members` | Full structural exploration from workspace root down to symbol declarations. |
| **Active Editor** | `Types` (Active Editor) ➔ `Members` ➔ `Callers` | High-velocity in-file navigation with instant incoming call hierarchy. |
| **Working Changes** | `Changes` (Git/Dirty) ➔ `Types` ➔ `Members` ➔ `Problems` | Pre-commit code inspection targeting modified symbols and their diagnostics. |
| **Problem Triage** | `Problems` ➔ `Types` ➔ `Members` ➔ `References` | Rapid debugging loop isolating compiler/lint errors and cascading usages. |
| **Type Hierarchy** | `Hierarchy` (Subtypes) ➔ `Members` ➔ `Implementations` | Exploring OOP inheritance models, abstract classes, and interface implementations. |
| **Open Editors** | `Open Files` ➔ `Types` ➔ `Members` ➔ `References` | Focused multi-file outline across currently open editor tabs. |

### Custom Presets

Save your current pane configurations and visual order to **Workspace** or **Global** settings using `Facet: Save Preset...`. Load or delete custom presets at any time.

---

## Pane Roles

Facet supports up to 6 simultaneous, fully configurable pane slots (`facet.pane.1` .. `facet.pane.6`):

- **Directories:** Browse workspace folder trees with hierarchical or flattened views and glob path exclusions.
- **Files:** Filter workspace files, open editor tabs, or files within selected directories.
- **Types:** Symbol trees for classes, interfaces, structs, and enums with subtype expansion.
- **Members:** Methods, properties, fields, constructors, and accessors categorized and sorted by position or name.
- **Hierarchy:** Dedicated type inheritance trees distinguishing subclass kinds (classes, interfaces, structs, enums).
- **Callers:** Incoming call hierarchies displaying calling function signatures and code line snippets.
- **Implementations & References:** Global implementation targets and usage occurrences with file locations.
- **Problems:** Workspace diagnostics grouped by severity (Error, Warning, Information, Hint).
- **Changes:** Dirty and Git-modified files with immediate symbol breakdown.

---

## Controls & Commands

### Pane Header Actions

Each pane header provides native VS Code inline and contextual menu controls:

- `$(list-tree)` **Display Mode:** Toggle between `Current` (direct children), `Flat` (recursive list), and `Hierarchy` (nested tree).
- `$(filter)` **Filter:** Configure glob match patterns or toggle symbol kind filters across 26 categories.
- `...` **More Actions Menu:**
  - `Configure Pane...`: Full interactive configuration menu.
  - `Change Type...`: Switch pane role (Files, Types, Members, Callers, Problems, etc.).
  - `Input Source...`: Select data source (`project`, `openEditors`, `activeEditor`, `previousPane`).
  - `Sort by...`: Change ordering (`position`, `name`, `category`).

### Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

- `Facet: Add Pane`: Append a new pane slot to the pipeline sequence.
- `Facet: Remove Pane...`: Remove a pane slot (preserves minimum 1 visible pane).
- `Facet: Apply Preset...`: Choose a built-in or custom workflow preset.
- `Facet: Save Preset...`: Save the current layout to workspace or global settings.
- `Facet: Load Preset...`: Load a saved pipeline preset.
- `Facet: Delete Preset...`: Remove a saved preset.
- `Facet: Focus on Pane...`: Quickly jump focus to any visible pane.
- `Facet: Configure Pane...`: Open configuration for any visible pane.

---

## Architecture & Performance

Facet is engineered for responsiveness in large enterprise codebases:

- **Tiered Symbol Resolution:** Resolves symbols via LSP `DocumentSymbol` (Tier 1), `SymbolInformation` (Tier 2), and regex/AST heuristics (Tier 3) when language servers are idle or unavailable.
- **Debounced Cursor Tracking:** Cursor tracking is debounced at 150ms with `CancellationTokenSource` support to prevent UI stutter during typing.
- **Smart Document Version Caching:** In-memory symbol cache keyed by `(uri, document.version)` eliminates redundant queries.
- **Non-Blocking Background Sync:** Heavy operations run asynchronously without freezing the editor or sidebar.

---

## License

MIT © [Adrian Renggli](LICENSE.md)
