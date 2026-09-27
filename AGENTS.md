# AGENTS.md — Facet Architecture & Implementation Guide (Exclusively Native Dynamic Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

### Core Non-Negotiable Principles

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
- **No Backward Compatibility:** Cleanup old and no longer used code. Do not add layers for backward compatibility. Update all users including tests immediately.

---

## 2. System Architecture

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
│  │  │ Native Pane 3: Symbols (`facet.pane.3`)      [☲][⑂][⚙][...]│  │  │
│  │  │    [Input: Previous Pane] [Tree: Yes] [Selection: Cursor]  │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: Members (`facet.pane.4`)      [☲][⑂][⚙][...]│  │  │
│  │  │    [Role: symbols] [Input: Previous Pane] [Tree: No]       │  │  │
│  │  │    - #processPayment()                                     │  │  │
│  │  │    - #validateOrder()                                      │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    ▲                                   │
│                                    │ Reveals / Focuses                 │
│                                    ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Standard VS Code Text Editors (TypeScript, Dart, Go, Python)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Structural Model & Native Actions

### Modular Pane System (`src/panes/`)

Each pane type is an isolated, single-responsibility `PaneDefinition<TConfig, TNode>` registered in `PaneRegistry`:
- **`src/panes/paneDefinition.ts`**: Core contracts, `PaneCapabilities`, `PaneExecutionContext`, and `PaneOutput`.
- **`src/panes/definitions/`**:
  - `directoriesPane.ts`: Role `directories`.
  - `filesPane.ts`: Role `files`.
  - `symbolsPane.ts`: Role `symbols` (unified types and members).
  - `hierarchyPane.ts`: Role `hierarchy`.
  - `relationsPane.ts`: Roles `definitions`, `declarations`, `implementations`, `references`, `callers`.
  - `problemsPane.ts`: Role `problems`.
  - `changesPane.ts`: Role `changes`.
- Adding a new pane requires zero changes to coordinator logic: implement `PaneDefinition`, register in `createDefaultPaneRegistry()`, and declare configuration types.

### Native Contextual Pane Controls & Header Actions

- **Pane Header Actions (Native `view/title`):**
  - **Inline Action Buttons (`group: "navigation"`):**
    - `$(list-flat)` / `$(list-tree)` Tree Display: Toggle between tree hierarchy and flat list display (when `capabilities.supportsTree` is true).
    - `$(filter)` Filter: Configure glob pattern (for directories/files) or 26 symbol kind toggles (for symbols/relations/hierarchy).
    - `$(gear)` Configure Pane: Opens pane configuration quickpick.
  - **Three-Dot Popup Menu (`...` / `group: "1_settings"`):**
    - `Configure Pane...`: Full configuration quickpick (Title, Type, Input, Selection, Sort, Filter, Tree Display).
    - `Change Type...`: Switch pane role.
    - `Input Source...`: Switch input source (`project`, `openEditors`, `activeEditor`, `previousPane`).
    - `Sort by...`: Change ordering (`position`, `name`, `category`).
- **Global Pipeline Operations (Command Palette `Ctrl+Shift+P` / `Cmd+Shift+P`):**
  - `Facet: Focus` (`facet.focus` / `Cmd+K F` or `Ctrl+K F`): Focus the Facet container / last active pane without altering selections.
  - `Facet: Select at Cursor and Focus` (`facet.syncCursorAndFocus` / `Cmd+K Shift+F` or `Ctrl+K Shift+F`): Sync Facet panes to the current editor cursor and focus the target pane.
  - `Facet: Add Pane` (`facet.addPane`): Append a new pane to the end of the pipeline sequence (up to 6 total slots).
  - `Facet: Remove Pane...` (`facet.removePane`): Pick and remove a pane from the pipeline (enforcing minimum 1 visible pane).
  - `Facet: Apply Preset...` (`facet.applyPreset`): Apply built-in presets (Project Browser, Implementors, Callers, References) or saved presets.
  - `Facet: Save Preset...` (`facet.savePreset`): Save active pipeline layout to Workspace or Global settings.
  - `Facet: Load Preset...` (`facet.loadPreset`): Load a saved preset from Workspace or Global settings.
  - `Facet: Delete Preset...` (`facet.deletePreset`): Remove a saved preset from Workspace or Global settings.
- **Dynamic Title Commands (Replacing Static Slot Numbers):**
  - *`Facet: Focus on $title`:* Dynamically surfaced in the Command Palette for each active pane in the pipeline (e.g., `Facet: Focus on Directories`, `Facet: Focus on Files`, `Facet: Focus on Definitions`, `Facet: Focus on Members`), immediately focusing that view.
  - *`Facet: Configure $title`:* Dynamically surfaced in the Command Palette for each active pane, opening its contextual configuration menu directly.
  - *`Facet: Focus on Pane...` & `Facet: Configure Pane...`:* QuickPick selector commands listing visible panes by their active titles.
  - Static commands like `Facet: Configure Pane $N` are suppressed from the Command Palette to avoid unhelpful slot-indexed entries.
- **Resilient Pane Folding:**
  - Collapsing a pane header folds the section natively in the sidebar without hiding or removing the slot from the pipeline.
- **`facet.revealRange`:** Navigates the active text editor to the target symbol range.

---

## 4. Robust Workspace Type Discovery & Hydration

1. **Workspace Symbol Query:** Executes `vscode.executeWorkspaceSymbolProvider`.
2. **Workspace AST File Scanner Fallback:** When language servers return empty results for empty queries (e.g. `tsserver`), Facet discovers workspace files (`vscode.workspace.findFiles`) and extracts type declarations (`class`, `interface`, `enum`, `struct`) using multi-tier AST resolution and cached regex parsing.
3. **Lazy Member Hydration:** When a project type is selected, Facet lazily hydrates its members, constructors, and fields on demand.
4. **Debounce & Invalidation:** Caret tracking is debounced by 150ms, cached by `(uri, document.version)`, and cancellable via `CancellationTokenSource`.

---

## 5. Verification & Testing

1. Run `npm test` to verify unit test suite across models, providers, and pipeline managers.
2. Launch Extension Host (`Cmd+F5`).
3. Verify native contextual behavior:
   - Click `⚙ Configure Pane` on any pane: test changing title, input source, selection source, filters, and tree display settings.
   - Multi-select multiple files in a `Files` pane and verify downstream panes display the aggregated union of types and members.
   - Move cursor in editor and verify simultaneous highlighting in `Files` and `Definitions` panes.
   - Click `Add Pane to End`: select `Callers` and confirm a new pane is appended in sequence.
   - Click `Remove Pane`: confirm pane is hidden and remaining slots remapped cleanly without breaking bindings.
   - Drag and drop views in VS Code workbench: verify upstream data flow remains linked via relative visible sequence.
   - Select `Project Browser` preset: confirm Pane 1 shows directories, Pane 2 shows files, Pane 3 shows top-level types (flat `Definitions` pane), and Pane 4 shows members (hierarchical `Members` pane).
