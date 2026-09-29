# Facet Code

A high-performance, structural code navigation deck built **100% natively for Visual Studio Code**.

Inspired by Smalltalk system browsers, Eclipse perspectives, and column explorers, Facet links directory structures, source files, definitions, member declarations, and symbol relations into an interactive, piped navigation stream—with **zero webviews, zero HTML/DOM, and zero runtime overhead**.

---

## Highlights

- **100% Native VS Code UI:** Built entirely on standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native theming, Codicons, badges, and inline actions.
- **Dynamic 6-Slot Pipeline:** Configure up to 6 native pane slots with relative upstream piping (`previousPane`) that immediately adapts as you browse or reorder views.
- **Native Workbench Drag-and-Drop:** Seamlessly reorder panes using VS Code's built-in workbench drag-and-drop. Internal SQLite storage monitoring updates upstream dependencies on the fly.
- **Pinning Subsystem & Cascading Locks:** Freeze any pane to a specific file or state with `$(pin)` / `$(pinned)`. Pinning automatically locks all downstream dependent panes so you can inspect other files without losing context.
- **Universal Multi-Selection Aggregation:** Select multiple directories, files, or types simultaneously. Downstream panes aggregate the union of symbols across all 4 tiers with smart deduplication.
- **Deep Cursor Tracking & Auto-Expansion:** Caret tracking identifies the enclosing type, active member, and document URI simultaneously, auto-expanding parent tree nodes with 150ms debounced synchronization.
- **24 Context Menu Operations:** Complete native workflows for file/folder creation, deletion, renaming, diff comparison, and LSP symbol refactoring directly from the tree.
- **6 Built-in Workflow Presets:** Instant one-click presets for project browsing, active file inspection, working git changes, problem triage, type hierarchies, and open editors.

---

## Installation

Install from the Visual Studio Code Marketplace by searching for `facet` in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`), or via Quick Open (`Ctrl+P` / `Cmd+P`):

```shell
ext install facet-code
```

---

## Getting Started

1. **Open the Deck:** Click the **Facet** icon in the Activity Bar, or press `Ctrl+K F` (`Cmd+K F` on macOS).
2. **Open Any File:** Open any source file in your workspace. Facet automatically resolves the enclosing file, types, and members in the active pipeline.
3. **Navigate & Inspect:**
   - **Click** any directory, file, definition, or member to reveal and navigate to its declaration in the active editor.
   - **Move Caret:** As you move your cursor in an open editor, Facet tracks your position and expands parent nodes automatically. Press `Ctrl+K Shift+F` (`Cmd+K Shift+F` on macOS) to force-select the symbol at the cursor and focus the deck.
   - **Multi-Select:** Hold `Ctrl` / `Cmd` or `Shift` to select multiple items; downstream panes aggregate their combined symbols.
   - **Pin:** Click `$(pin)` on any pane header to freeze it while browsing other files.
   - **Filter:** Press `/` or `Ctrl+F` / `Cmd+F` inside any pane to filter items, or click `$(filter)` on the header.
4. **Switch Presets:** Click `$(layers)` in the view container header or run `Facet: Apply Preset...` (`facet.applyPreset`) to switch workflows.

---

## Built-in Workflow Presets

Facet includes 6 production-ready pipeline presets out of the box:

### 1. Workspace Explorer
Top-down workspace navigation from root folders down to nested member declarations.
```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Directories   │ ──► │      Files      │ ──► │   Definitions   │ ──► │     Members     │
│   (tree: true)  │     │  (tree: false)  │     │ (symbols, flat) │     │  (symbols, tree)│
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Directories:** Browse folder hierarchy.
- **Files:** Direct 1-level child files of selected directory.
- **Definitions:** Top-level types (classes, interfaces, structs, enums) declared in selected file(s).
- **Members:** Hierarchical members (methods, properties, fields) declared in selected type(s).

### 2. Active Editor
High-velocity in-file navigation with instant incoming call hierarchy.
```text
┌────────────────────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│            Symbols             │ ──► │     Members     │ ──► │     Callers     │
│   (activeEditor, tree: true)   │     │  (tree: false)  │     │ (previousPane)  │
└────────────────────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Symbols:** Complete type hierarchy of the active editor document.
- **Members:** Flattened list of member declarations for the selected type.
- **Callers:** Incoming calls with source code snippet previews and calling locations.

### 3. Working Changes
Pre-commit code inspection targeting modified files and diagnostics.
```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Changes     │ ──► │     Symbols     │ ──► │     Members     │ ──► │    Problems     │
│ (project / git) │     │  (tree: true)   │     │  (tree: false)  │     │    (project)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Changes:** Dirty in-memory editor buffers and Git working tree / index modifications.
- **Symbols & Members:** Quick outline of declared structures in changed files.
- **Problems:** Active compiler and linter diagnostics across the workspace.

### 4. Problem Triage
Rapid debugging loop isolating compiler/lint errors and cascading usages.
```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Problems     │ ──► │     Symbols     │ ──► │     Members     │ ──► │   References    │
│    (project)    │     │  (tree: true)   │     │  (tree: false)  │     │ (previousPane)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Problems:** Workspace errors and warnings grouped by severity.
- **Symbols & Members:** Types and methods declaring the problematic code.
- **References:** All workspace usages of the affected symbol with code snippets.

### 5. Type Hierarchy
Deep object-oriented inheritance exploration and interface implementation discovery.
```text
┌────────────────────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│           Hierarchy            │ ──► │     Members     │ ──► │ Implementations │
│     (project, tree: true)      │     │  (tree: false)  │     │ (previousPane)  │
└────────────────────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Hierarchy:** Superclass tree and recursive subtype tree with cycle detection.
- **Members:** Member declarations of the selected class or interface.
- **Implementations:** Concrete implementations across the workspace.

### 6. Open Editors
Multi-file working set navigator tracking open editor tabs.
```text
┌────────────────────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│           Open Files           │ ──► │     Symbols     │ ──► │     Members     │ ──► │   References    │
│      (openEditors, files)      │     │  (tree: true)   │     │  (tree: false)  │     │ (previousPane)  │
└────────────────────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```
- **Open Files:** All files currently open in editor tabs.
- **Symbols & Members:** Structural outline across open documents.
- **References:** Usages of selected members across the workspace.

---

## Custom Presets Management

Create and persist custom pipeline layouts tailored to your project:

- **Save Current Layout:** Run `Facet: Save Preset...` (`facet.savePreset`) from the Command Palette or view container menu. Choose whether to save to **Workspace** (`.vscode/settings.json`) or **Global** user settings.
- **Load a Preset:** Run `Facet: Load Preset...` (`facet.loadPreset`) or click `$(layers)` in the view container header (`facet.pane.presets`).
- **Delete a Preset:** Run `Facet: Delete Preset...` (`facet.deletePreset`).
- **Persistence Settings:** Saved presets are stored in VS Code configuration under `facet.presets.workspace` and `facet.presets.global`.

---

## Pinning Subsystem & Cascading Locks

Facet includes a dedicated Pinning subsystem allowing you to lock panes during complex multi-file reviews:

- **Header Pin Toggle:** Click `$(pin)` ("Pin") on any pane header to freeze the pane. The icon switches to `$(pinned)` ("Unpin").
- **Active Editor Isolation:** When a pane with `inputSource: 'activeEditor'` is pinned, Facet captures its `pinnedUri`. Switching tabs or editors will **not** alter the pane's content.
- **Cascading Lock:** Pinning any upstream pane automatically cascades `pinned: true` to all downstream panes configured with `inputSource: 'previousPane'`. This guarantees that your entire downstream pipeline remains frozen to the pinned context.
- **Cascading Unlock & Re-Sync:** Unpinning unlocks all dependent downstream panes and immediately triggers an automatic synchronization with the currently active editor.
- **Commands:** `Facet: Toggle Pin` (`facet.togglePin`), `Facet: Pin Pane...` (`facet.pinPane`), and `Facet: Unpin Pane...` (`facet.unpinPane`).

---

## Universal Multi-Selection Aggregation

Select multiple items using `Ctrl` / `Cmd` or `Shift` to aggregate symbols across all 4 tiers:

1. **Tier 1 (Directories ➔ Files):** Selecting multiple directories in the Directories pane aggregates all files from all selected directories in the downstream Files pane.
2. **Tier 2 (Files ➔ Types):** Selecting multiple files in the Files pane aggregates the union of all declared types (classes, interfaces, structs, enums) in the downstream Definitions pane.
3. **Tier 3 (Types ➔ Members):** Selecting multiple types aggregates the union of all their methods, fields, and properties in the Members pane, with smart deduplication.
4. **Tier 4 (Members ➔ Relations):** Selecting multiple members computes the combined union of references, callers, definitions, declarations, or implementations simultaneously.
5. **Caret Protection:** When 2 or more items are selected in a pane, automated cursor tracking skips updating that pane so your multi-selection is never accidentally cleared by editor navigation.

---

## Deep Cursor Tracking & Tree Sync

Facet provides continuous, non-intrusive caret synchronization:

- **Simultaneous Resolution:** Identifies enclosing type, active member, and file URI simultaneously.
- **Hierarchical Auto-Expansion:** Uses `getParent()` tree resolution to automatically expand parent classes and namespace nodes so the active member is revealed smoothly.
- **Debounced Execution:** Caret movements are coalesced with a 150ms debounce window and managed via `CancellationTokenSource` to prevent UI thread lockups during rapid typing.
- **Redundancy Guards:** Avoids unnecessary tree re-renders and view jitter when moving the caret within the same symbol.
- **On-Demand Synchronization:** If automatic tracking is disabled (`facet.autoSyncCursor: false`), press `Cmd+K Shift+F` (`Ctrl+K Shift+F` on Windows/Linux) to force-select the symbol at the cursor and focus the deck.

---

## 24 Context Menu Operations

Right-click any item in Facet to access rich native operations:

### File & Directory Management
| Command | Icon | Target | Description |
| :--- | :--- | :--- | :--- |
| **New File...** | `$(new-file)` | Directory | Prompt to create a new file in the selected directory. |
| **New Folder...** | `$(new-folder)` | Directory | Prompt to create a new subfolder in the selected directory. |
| **Rename...** | `$(edit)` | File, Directory | Prompt to rename the file or directory on disk. |
| **Delete** | `$(trash)` | File, Directory | Delete the file or directory (with modal confirmation). |
| **Find in Folder...** | `$(search)` | Directory | Open global search scoped to the selected folder. |
| **Open to the Side** | `$(split-horizontal)` | All items | Open the file or symbol declaration in a side editor column. |
| **Reveal in Explorer View** | `$(list-tree)` | File, Directory | Reveal and select the item in VS Code's native File Explorer. |
| **Reveal in File Explorer / Finder** | `$(folder-opened)` | All items | Open the enclosing folder in the operating system file manager. |
| **Open in Integrated Terminal** | `$(terminal)` | File, Directory | Launch an integrated terminal instance at the folder's path. |
| **Copy Path** | `$(copy)` | All items | Copy the absolute filesystem path to the clipboard. |
| **Copy Relative Path** | `$(copy)` | All items | Copy the workspace-relative path to the clipboard. |

### Diff Comparison
| Command | Target | Description |
| :--- | :--- | :--- |
| **Select for Compare** | File | Mark the selected file as the baseline comparison target. |
| **Compare with Selected** | File | Open a side-by-side diff editor comparing this file with the marked target. |

### Symbol LSP Navigation & Refactoring
| Command | Target | Description |
| :--- | :--- | :--- |
| **Go to Definition** | Symbol | Jump directly to where the symbol is defined. |
| **Peek Definition** | Symbol | Open an inline peek window showing the symbol definition. |
| **Go to Declaration** | Symbol | Jump to the symbol's declaration. |
| **Go to Type Definition** | Symbol | Jump to the definition of the symbol's underlying type. |
| **Go to Implementations** | Symbol | Jump to implementations of the interface, abstract class, or method. |
| **Peek Implementations** | Symbol | Open an inline peek window showing all implementations. |
| **Find All References** | Symbol | Find and display all workspace usages of the symbol in the References view. |
| **Peek Call Hierarchy** | Symbol | Inspect incoming and outgoing call hierarchy inline. |
| **Peek Type Hierarchy** | Symbol | Inspect supertypes and subtypes inline. |
| **Rename Symbol** | Symbol | Trigger language-server-wide symbol rename. |
| **Copy Symbol Name** | Symbol | Copy the raw symbol name to the clipboard. |

### Diagnostics
| Command | Target | Description |
| :--- | :--- | :--- |
| **Copy Problem Message** | Problem | Copy the diagnostic error or warning message to the clipboard. |

---

## Controls & Header Actions

### View Container Header Actions
Located in the Activity Bar title bar for the Facet view container:
- `$(layers)` **Apply Preset...:** Quick-pick menu to load built-in or custom workflow presets.
- `$(add)` **Add Pane:** Append a new pane slot to the end of the pipeline (up to 6 slots).
- `$(target)` **Select at Cursor and Focus:** Synchronize Facet with the active editor caret and shift focus.
- `$(layout-sidebar-left)` **Focus Deck:** Focus the first active pane in the Facet navigation deck.

### Pane Header Actions
Located on the header of each individual pane slot:
- `$(list-tree)` / `$(list-flat)` **Toggle Tree/Flat:** Switch between hierarchical tree and flat list views. For Files, toggles between recursive descendant traversal and 1-level direct children. For Symbols, toggles between nested tree and flat outline.
- `$(pin)` / `$(pinned)` **Toggle Pin:** Lock or unlock the pane and its downstream dependents.
- `$(filter)` **Filter:** Configure glob match patterns or toggle symbol kind filters across 26 categories (plus subclass kind filters in Hierarchy).
- `$(gear)` **Configure Pane...:** Comprehensive configuration menu to adjust title, role, input source, selection source, display mode, sorting, and filters.
- `$(symbol-class)` **Change Type...:** Switch pane role among all 11 modular types.
- `$(sign-in)` **Input Source...:** Switch input source (`project`, `openEditors`, `activeEditor`, `previousPane`).
- `$(sort-precedence)` **Sort...:** Change sorting order (`position`, `name`, `category`).

---

## The 11 Modular Pane Roles

| Role | Supported Inputs | Display Modes | Description |
| :--- | :--- | :--- | :--- |
| **Directories** | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree, Flat | Workspace folder explorer with glob exclusions and name/position sorting. |
| **Files** | `project`, `openEditors`, `activeEditor`, `previousPane` | Descendant Tree, 1-Level Children | File browser. Tree mode toggles between recursive descendant traversal and direct children. |
| **Symbols** | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree, Flat | Unified types and members outline. Adapts automatically: files input yields types; type input yields members. Supports 26 symbol kind filters. |
| **Hierarchy** | `project`, `openEditors`, `activeEditor`, `previousPane` | Tree, Flat | Type inheritance explorer displaying superclasses and recursive subtypes with cycle detection and subclass type filters (class, interface, struct, enum). |
| **Definitions** | `previousPane` | Flat with preview | Relation target finder resolving Go to Definition targets via `vscode.executeDefinitionProvider`. |
| **Declarations** | `previousPane` | Flat with preview | Relation target finder resolving Go to Declaration targets via `vscode.executeDeclarationProvider`. |
| **Implementations**| `previousPane` | Flat with preview | Relation target finder resolving interface and method implementations via `vscode.executeImplementationProvider`. |
| **References** | `previousPane` | Flat with preview | Relation target finder resolving all workspace symbol usages via `vscode.executeReferenceProvider`. |
| **Callers** | `previousPane` | Flat with preview | Relation target finder resolving incoming call hierarchies via `vscode.prepareCallHierarchy` / `vscode.provideIncomingCalls`. |
| **Problems** | `project`, `openEditors`, `activeEditor`, `previousPane` | Flat | Diagnostics navigator displaying workspace or editor compiler and linter errors/warnings. |
| **Changes** | `project`, `openEditors`, `activeEditor`, `previousPane` | Flat | Changed files inspector showing dirty in-memory editor buffers and Git working tree / index modifications. |

> **Note on Symbols vs. Definitions:**  
> - **Symbols (`role: 'symbols'`):** Extracts the structural AST outline of declarations inside a file (used for the "Definitions" and "Members" views in Workspace Explorer).  
> - **Definitions (`role: 'definitions'`):** Executes a Go to Definition relation search to find where a selected symbol is defined across the entire workspace.

---

## Configuration Settings

Customize Facet behavior in VS Code Settings (`Ctrl+,` / `Cmd+,`):

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `facet.autoSyncCursor` | `boolean` | `true` | Automatically synchronize Facet pane selections with the active editor cursor position. |
| `facet.presets.workspace` | `object` | `{}` | Custom Facet pipeline presets saved to the current workspace (`.vscode/settings.json`), mapping preset names to arrays of pane configurations. |
| `facet.presets.global` | `object` | `{}` | Custom Facet pipeline presets saved globally across workspaces, mapping preset names to arrays of pane configurations. |

---

## Keybindings

| Command | macOS | Windows / Linux | When |
| :--- | :--- | :--- | :--- |
| `Facet: Focus` (`facet.focus`) | `Cmd+K F` | `Ctrl+K F` | Global |
| `Facet: Select at Cursor and Focus` (`facet.syncCursorAndFocus` / `facet.selectAtCursorAndFocus`) | `Cmd+K Shift+F` | `Ctrl+K Shift+F` | `editorTextFocus` |

---

## License

MIT © [Lukas Renggli](https://www.lukas-renggli.ch/)
