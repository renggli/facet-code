# Facet

A structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

Inspired by Smalltalk system browsers, Eclipse perspectives, and column explorers, Facet links directory structures, source files, definitions, member declarations, and symbol relations into an interactive, piped navigation stream without web runtime overhead.

## Install

Install from the Visual Studio Code Marketplace or by searching within the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`) for `facet`.

Alternatively, launch VS Code Quick Open (`Ctrl+P` / `Cmd+P`), paste the following command, and press enter:

```shell
ext install facet-code
```

## Getting Started

1. **Open the Deck:** Click the **Facet** icon in the Activity Bar, or press `Ctrl+K F` (`Cmd+K F` on macOS) to focus the deck.
2. **Open a File:** Open any source file in your workspace. Facet automatically resolves and highlights the enclosing file, types, and members in the active pane sequence.
3. **Navigate:**
   * **Click** any directory, file, definition, or member to reveal and highlight its declaration in the active editor.
   * **Track Cursor:** Move your cursor in an open editor—Facet tracks your caret position, expanding parent nodes automatically. Press `Ctrl+K Shift+F` (`Cmd+K Shift+F` on macOS) to force-select the symbol at the cursor and focus the deck.
   * **Filter:** Press `/` or `Ctrl+F` / `Cmd+F` inside any pane to fuzzy-filter declarations or files using VS Code's native tree filter, or click `$(filter)` on the pane header.
   * **Multi-Select:** Hold `Ctrl` / `Cmd` or `Shift` to select multiple files or definitions; downstream panes aggregate the union of symbols.
4. **Switch Workflows:** Click `$(layers)` in the view container header or run `Facet: Apply Preset...` to load workflow layouts.

## Workflow Presets

Facet includes six ready-to-use pipeline presets out of the box:

| Preset | Pipeline Flow | Best For |
| :-- | :-- | :-- |
| **Project Browser** | `Directories (tree)` ➔ `Files (1-level)` ➔ `Definitions (flat)` ➔ `Members (tree)` | Full top-down workspace navigation from root folders down to nested symbol declarations. |
| **Active Editor** | `Symbols (activeEditor, tree)` ➔ `Members (flat)` ➔ `Callers` | High-velocity in-file navigation with instant incoming call hierarchy. |
| **Working Changes** | `Changes (Git/Dirty)` ➔ `Symbols (tree)` ➔ `Members (flat)` ➔ `Problems` | Pre-commit code inspection targeting modified symbols and their diagnostics. |
| **Problem Triage** | `Problems (Workspace)` ➔ `Symbols (tree)` ➔ `Members (flat)` ➔ `References` | Rapid debugging loop isolating compiler/lint errors and cascading usages. |
| **Type Hierarchy** | `Hierarchy (Subtypes)` ➔ `Members (flat)` ➔ `Implementations` | Exploring OOP inheritance models, abstract classes, and interface implementations. |
| **Open Editors** | `Open Files (openEditors)` ➔ `Symbols (tree)` ➔ `Members (flat)` ➔ `References` | Focused multi-file outline across currently open editor tabs. |

### Custom Presets

Save current pane configurations and visual order to **Workspace** or **Global** settings using `Facet: Save Preset...`. Load or delete custom presets at any time via the Command Palette or view header menus.

## Native Drag-and-Drop Reordering & Piping

Facet supports up to 6 simultaneous native pane slots (`facet.pane.1` .. `facet.pane.6`):

- **Workbench Drag-and-Drop:** Reorder panes naturally by dragging and dropping pane headers within the Facet view container.
- **Out-of-the-Box Piping:** Downstream panes configured with `previousPane` automatically adapt their input to whatever pane visually precedes them.
- **Add & Remove Panes:** Add pane slots to the end of the deck or remove them while maintaining a minimum of 1 visible pane without corrupting slot indexing.

## Pane Roles

* **Directories:** Browse workspace folder trees with hierarchical (`tree: true`) or flattened views and glob path exclusions.
* **Files:** Browse workspace files, open editor tabs, or files within selected directories. Tree mode toggles between recursive descendant traversal (`tree: true`) and 1-level direct children (`tree: false`).
* **Definitions & Symbols:** Unified types and members navigator. When input is files, enumerates definitions (classes, interfaces, structs, enums) either as a flat list or hierarchy. When input is a type, enumerates member declarations (flat or nested tree). Configurable with 26 symbol kind filters and position, name, or category sorting.
* **Hierarchy:** Dedicated type inheritance trees distinguishing subclass kinds (classes, structs) with recursive subtype expansion.
* **Definitions, Declarations, Implementations & References:** Dedicated symbol relation views with code snippet previews, workspace file paths, and line numbers.
* **Callers:** Incoming call hierarchies displaying calling function signatures and code line snippets.
* **Problems:** Workspace or editor diagnostics grouped by severity (Error, Warning, Information, Hint).
* **Changes:** Dirty and Git-modified files with immediate symbol breakdown.

## Controls & Keybindings

### Pane Header Actions

Each pane header provides native VS Code controls:

* `$(list-tree)` / `$(list-flat)` **Toggle Tree/Flat:** Direct toggle on the pane header for supported panes. For Files, toggles between recursive enumeration and 1-level direct children. For Definitions/Members, toggles between nested hierarchy and flat list.
* `$(filter)` **Filter:** Configure glob match patterns or toggle symbol kind filters across 26 categories.
* `$(gear)` **Configure Pane:** Single uncluttered configuration menu to adjust title, role, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), sorting (`position`, `name`, `category`), display mode, and filters.

### View Container Header Actions

* `$(layers)` **Apply Preset...:** Quick-pick menu for built-in and custom presets.
* `$(add)` **Add Pane:** Append a new pane slot to the end of the pipeline.
* `$(target)` **Select at Cursor and Focus:** Synchronize the active editor caret to Facet and shift focus.
* `$(layout-sidebar-left)` **Focus Deck:** Bring focus to the Facet navigation deck.

### Keyboard Shortcuts

| Command | macOS | Windows / Linux | When |
| :-- | :-- | :-- | :-- |
| `Facet: Focus` | `Cmd+K F` | `Ctrl+K F` | Global |
| `Facet: Select at Cursor and Focus` | `Cmd+K Shift+F` | `Ctrl+K Shift+F` | Editor text focused |

### Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

* `Facet: Focus`: Focus the Facet navigation deck.
* `Facet: Select at Cursor and Focus`: Synchronize selection to editor cursor and focus.
* `Facet: Add Pane`: Append a new pane slot to the pipeline sequence.
* `Facet: Remove Pane...`: Remove a pane slot (preserves minimum 1 visible pane).
* `Facet: Apply Preset...`: Choose a built-in or custom workflow preset.
* `Facet: Save Preset...`: Save the current layout to workspace or global settings.
* `Facet: Load Preset...`: Load a saved pipeline preset.
* `Facet: Delete Preset...`: Remove a saved preset.
* `Facet: Configure Pane...`: Open configuration for any visible pane.

## Architecture & Performance

* **100% Native VS Code UI:** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native theming, Codicons, badges, and inline actions.
* **Deep Cursor Tracking & Tree Sync:** Identifies enclosing type, active member, and document URI simultaneously, auto-expanding hierarchical parents.
* **Universal Multi-Selection (`canSelectMany: true`):** Selecting multiple files aggregates their definitions; selecting multiple types aggregates their members; selecting multiple members computes combined relations.
* **Resilient & Non-Blocking:** In-memory caching keyed by `(uri, document.version)`, debounced background synchronization (150ms) with `CancellationTokenSource`, and tiered LSP fallbacks down to regex parsing.

## License

MIT © [Lukas Renggli](LICENSE.md)
