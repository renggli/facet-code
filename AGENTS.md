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
    - `DirectoriesPaneConfig`: Role `directories`, glob filtering, position/name sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), display (`current`, `flat`, `hierarchy`).
    - `FilesPaneConfig`: Role `files`, glob file filtering, position/name sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), display (`current`, `flat`, `hierarchy`).
    - `TypesPaneConfig` & `HierarchyPaneConfig`: Role `types`/`hierarchy`, hierarchical vs. flat display mode, selectable subclass kinds, 26 symbol kind filters, position/name/category sorting, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`).
    - `MembersPaneConfig`: Role `members`, 26 symbol kind filters, flat vs. hierarchical display, position/name/category sorting, input source (`openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`).
    - `DefinitionsPaneConfig`, `DeclarationsPaneConfig`, `ImplementationsPaneConfig`, `ReferencesPaneConfig`: Dedicated symbol relation/navigation views with readable snippet previews, file paths, 26 symbol kind filters, position/name sorting, input source (`previousPane`), selection source (`all`, `none`).
    - `CallersPaneConfig`: Incoming calls with container and snippet preview, input source (`previousPane`), selection source (`all`, `none`).
    - `ProblemsPaneConfig`: Workspace/editor/active diagnostics with severity grouping, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), position/name/category sorting.
    - `ChangesPaneConfig`: Dirty and changed files, input source (`project`, `openEditors`, `activeEditor`, `previousPane`), selection source (`cursor`, `all`, `none`), position/name sorting.
  - **Pipeline Settings (Adding & Removing with Drag-and-Drop Resilience):**
    - *Add Pane:* Append a new pane to the end of the pipeline sequence (up to 6 total slots).
    - *Remove Pane:* Hide this pane from the pipeline (enforcing minimum 1 visible pane), shifting subsequent slots without corrupting slot indexing or upstream references.
  - **Presets & Persistence**:
    - Predefined presets out of the box (`Project Browser`, `Implementors`, `Callers`, `References`).
    - Save, load, and delete custom presets to Workspace (`facet.presets.workspace`) or Global settings (`facet.presets.global`).
    - **Predefined Presets (`facet.pane.presets`):**
      - **Project Browser:** Directories (hierarchical) -> Files -> Types (hierarchical) -> Members.
      - **Implementors:** Types (hierarchical) -> Members -> Implementations.
      - **Callers:** Types -> Members -> Callers.
      - **References:** Types -> Members -> References.
  - **Display Modes for Directories and Files**:
    - `current`: Non-recursive. Shows immediate direct children of previous directory or top-level project items.
    - `flat`: Recursive. Recursively traverses all descendants and flattens into a single list.
    - `hierarchy`: Tree. Full nested hierarchical tree structure with collapsible child nodes.
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
│                                                    │ State & Projections│
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 100% Native Facet Navigation Deck (`facet-container`)            │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Native Pane 1: Directories (`facet.pane.1`)           [⚙]   │  │  │
│  │  │    [Input: Project] [Display: Hierarchy] [Selection: Cursor│  │  │
│  │  │    - 📁 src                                                 │  │  │
│  │  │      - 📁 services                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 2: Files (`facet.pane.2`)                 [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Selection: Cursor]              │  │  │
│  │  │    - 📄 order.ts                                            │  │  │
│  │  │    - 📄 payment.ts                                          │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 3: Types (`facet.pane.3`)                 [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Display: Hierarchy]             │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: Members (`facet.pane.4`)               [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Filters: Methods, Fields]       │  │  │
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

### Native Contextual Pane Controls

- **`facet.pane.configure` (`$(gear)`):** Single contextual action on each pane header providing:
  - *Title:* Edit title via InputBox.
  - *Type:*
    - Files
    - Directories
    - Types
    - Members
    - Definitions
    - Declarations
    - Implementations
    - References
    - Callers
    - Hierarchy
    - Problems
    - Changes
  - *Input Source:*
    - Project (for files, directories, types, problems, changes)
    - Open Editors (for files, directories, types, members, problems, changes)
    - Active Editor (for files, directories, types, members, problems, changes)
    - Previous Pane (for files, directories, types, members, definitions, declarations, implementations, references, callers, hierarchy, problems, changes)
  - *Selection Source:*
    - All (selects everything by default)
    - None (selects nothing by default)
    - Cursor (selects the item under the cursor)
  - *Filter:*
    - For files/directories this is a glob pattern on the full path
    - For types/members/definitions/declarations/implementations/references/callers/hierarchy this is toggles across 26 symbol kinds
  - *Sort by:*
    - Position
    - Name
    - Category
  - *Display:*
    - Current vs Flat vs Hierarchy (for files, directories); Flat vs Hierarchy (for types, members, hierarchy)
  - (horizontal separator)
  - *Add Pane*: Append new pane to the end.
  - *Remove Pane*: Removes the current pane.
  - (horizontal separator)
  - *Apply Preset*:
    - Project Browser (default): directories (hierarchical) -> files -> types (hierarchical) -> members
    - Implementors: types -> members -> implementors
    - Callers: types -> members -> callers
    - References: types -> members -> references
- **Dynamic Title Commands (Replacing Static Slot Numbers):**
  - *`Facet: Focus on $title`:* Dynamically surfaced in the Command Palette for each active pane in the pipeline (e.g., `Facet: Focus on Directories`, `Facet: Focus on Files`, `Facet: Focus on Types`, `Facet: Focus on Members`), immediately focusing that view.
  - *`Facet: Configure $title`:* Dynamically surfaced in the Command Palette for each active pane, opening its contextual configuration menu directly.
  - *`Facet: Focus on Pane...` & `Facet: Configure Pane...`:* QuickPick selector commands listing visible panes by their active titles.
  - Static commands like `Facet: Configure Pane $N` are suppressed from the Command Palette to avoid unhelpful slot-indexed entries.
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
   - Click `⚙ Configure Pane` on any pane: test changing title, input source, selection source, filters, and display mode.
   - Multi-select multiple files in a `Files` pane and verify downstream panes display the aggregated union of types and members.
   - Move cursor in editor and verify simultaneous highlighting in `Files`, `Types`, and `Members` panes.
   - Click `Add Pane to End`: select `Callers` and confirm a new pane is appended in sequence.
   - Click `Remove Pane`: confirm pane is hidden and remaining slots remapped cleanly without breaking bindings.
   - Drag and drop views in VS Code workbench: verify upstream data flow remains linked via relative visible sequence.
   - Select `Project Browser` preset: confirm Pane 1 shows directories, Pane 2 shows files, Pane 3 shows types, and Pane 4 shows members.
