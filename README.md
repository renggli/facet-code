# Facet

A structural, configurable code navigation deck built 100% natively for Visual Studio Code.

Inspired by Smalltalk system browsers, Eclipse perspectives, and column explorers, Facet links directory structures, source files, type definitions, member declarations, and symbol relations into an interactive, piped navigation stream.

## Install

Install from the Visual Studio Code Marketplace or by searching within the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`) for `facet`.

Alternatively, launch VS Code Quick Open (`Ctrl+P` / `Cmd+P`), paste the following command, and press enter:

```shell
ext install facet-code
```

## Getting Started

1. **Open the Deck:** Click the **Facet** icon in the Activity Bar or run `Facet: Focus on Pane...` from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. **Open a File:** Open any source file in your workspace. Facet automatically resolves and highlights the enclosing file, types, and members in the active pane sequence.
3. **Navigate:**
   * **Click** any directory, file, type, or member to reveal and highlight its declaration in the active editor.
   * **Move your cursor** in the open editor—Facet tracks your caret position, expanding parent nodes automatically.
   * **Filter:** Press `/` or `Ctrl+F` / `Cmd+F` inside any pane to fuzzy-filter declarations or files using VS Code's native tree filter.
   * **Multi-Select:** Hold `Ctrl` / `Cmd` or `Shift` to select multiple files or types; downstream panes aggregate the union of symbols.
4. **Switch Workflows:** Run `Facet: Apply Preset...` to load workflow layouts for code browsing, incoming call tracking, or problem triage.

## Workflow Presets

Facet includes six ready-to-use pipeline presets out of the box:

| Preset | Pipeline Flow | Best For |
| :-- | :-- | :-- |
| **Project Browser** | `Directories` ➔ `Files` ➔ `Types` ➔ `Members` | Full top-down workspace navigation from root folders down to symbol declarations. |
| **Active Editor** | `Types` (Active Editor) ➔ `Members` ➔ `Callers` | High-velocity in-file navigation with instant incoming call hierarchy. |
| **Working Changes** | `Changes` (Git/Dirty) ➔ `Types` ➔ `Members` ➔ `Problems` | Pre-commit code inspection targeting modified symbols and their diagnostics. |
| **Problem Triage** | `Problems` ➔ `Types` ➔ `Members` ➔ `References` | Rapid debugging loop isolating compiler/lint errors and cascading usages. |
| **Type Hierarchy** | `Hierarchy` (Subtypes) ➔ `Members` ➔ `Implementations` | Exploring OOP inheritance models, abstract classes, and interface implementations. |
| **Open Editors** | `Open Files` ➔ `Types` ➔ `Members` ➔ `References` | Focused multi-file outline across currently open editor tabs. |

### Custom Presets

Save current pane configurations and visual order to **Workspace** or **Global** settings using `Facet: Save Preset...`. Load or delete custom presets at any time via the Command Palette.

## Pane Roles

Facet supports up to 6 simultaneous, fully configurable pane slots (`facet.pane.1` .. `facet.pane.6`):

* **Directories:** Browse workspace folder trees with hierarchical or flattened views and glob path exclusions.
* **Files:** Filter workspace files, open editor tabs, or files within selected directories.
* **Types:** Symbol trees for classes, interfaces, structs, and enums with subtype expansion.
* **Members:** Methods, properties, fields, constructors, and accessors categorized and sorted by position or name.
* **Hierarchy:** Dedicated type inheritance trees distinguishing subclass kinds (classes, interfaces, structs, enums).
* **Callers:** Incoming call hierarchies displaying calling function signatures and code line snippets.
* **Implementations & References:** Global implementation targets and usage occurrences with file locations.
* **Problems:** Workspace diagnostics grouped by severity (Error, Warning, Information, Hint).
* **Changes:** Dirty and Git-modified files with immediate symbol breakdown.

## Controls & Commands

### Pane Header Actions

Each pane header provides native VS Code controls:

* `$(list-tree)` **Display Mode:** Toggle between `Current` (direct children), `Flat` (recursive list), and `Hierarchy` (nested tree).
* `$(filter)` **Filter:** Configure glob match patterns or toggle symbol kind filters across 26 categories.
* `...` **More Actions Menu:**
  * `Configure Pane...`: Full interactive configuration menu.
  * `Change Type...`: Switch pane role (Files, Types, Members, Callers, Problems, etc.).
  * `Input Source...`: Select data source (`project`, `openEditors`, `activeEditor`, `previousPane`).
  * `Sort by...`: Change ordering (`position`, `name`, `category`).

### Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)

* `Facet: Add Pane`: Append a new pane slot to the pipeline sequence.
* `Facet: Remove Pane...`: Remove a pane slot (preserves minimum 1 visible pane).
* `Facet: Apply Preset...`: Choose a built-in or custom workflow preset.
* `Facet: Save Preset...`: Save the current layout to workspace or global settings.
* `Facet: Load Preset...`: Load a saved pipeline preset.
* `Facet: Delete Preset...`: Remove a saved preset.
* `Facet: Focus on Pane...`: Jump focus to any visible pane.
* `Facet: Configure Pane...`: Open configuration for any visible pane.

## License

MIT © [Lukas Renggli](LICENSE.md)
