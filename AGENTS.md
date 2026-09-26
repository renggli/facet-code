# AGENTS.md — Facet Architecture & Implementation Guide (Exclusively Native Dynamic Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

### Core Non-Negotiable Principles

- **Exclusively Native VS Code UI:** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline actions.
- **Always-On Clarity & Navigation:** Symbol icons, contextual details (signatures, locations), and auto-reveal on click/selection are permanently enabled natively with zero toggle overhead.
- **Dynamic Native Pane Pipeline:** Up to 6 configurable native pane slots (`facet.pane.1` .. `facet.pane.6`) hosted inside the `facet-container` Activity Bar view container:
  - **Single Contextual Menu per Pane (`facet.pane.configure` `$(gear)`):** Clean, uncluttered pane headers replacing bars of individual action icons.
  - **Distinct Strongly-Typed Pane Configurations:**
    - `FilesPaneConfig`: Role `files`, regexp file filtering, file-based sorting, input source (`global`, `file`, `pane`), selection source (`cursor`, `all`, `none`).
    - `TypesPaneConfig` & `HierarchyPaneConfig`: Role `types`/`hierarchy`, hierarchical vs. flat display mode, selectable subclass kinds, type-specific symbol filters (`class`, `interface`, `struct`, `enum`, `module`, `namespace`), grouped sorting.
    - `MembersPaneConfig`: Role `members`, member-specific symbol filters (`method`, `field`, `property`, `constructor`, `constant`, `variable`, `function`, `event`, `operator`), flat vs. hierarchical display, grouped sorting.
    - `ReferencesPaneConfig`, `ImplementationsPaneConfig`, `CallersPaneConfig`: Dedicated relation views with readable snippet previews, file paths, and upstream pane chaining.
  - **Pipeline Settings (Adding & Removing with Drag-and-Drop Resilience):**
    - *Add Pane to End:* Append a new pane to the end of the pipeline sequence (up to 6 total slots).
    - *Remove Pane:* Hide this pane from the pipeline (enforcing minimum 1 visible pane), shifting subsequent slots without corrupting slot indexing or upstream references.
    - *Drag-and-Drop Resilient Upstream Chaining:* Explicit `inputPaneId` and role-based fallback resolution (`types`/`hierarchy` -> `files`, `members` -> `types`, `relations` -> `members`) decouple data flow from physical slot positions in the workbench.
- **Predefined Presets (`facet.pane.presets`):**
  - **Project Browser:** Global Types (`global`) -> Members (`pane`) -> References (`pane`).
  - **Implementations Browser:** Global Types (`global`) -> Members (`pane`) -> Implementations (`pane`).
  - **Callers Browser:** Global Types (`global`) -> Members (`pane`) -> Callers (`pane`).
  - **Compact Outline:** Active File Types (`file`) -> Members (`pane`).
  - **File Browser:** Files (`global`) -> Types (`pane`) -> Members (`pane`).
- **High-Readability Relations Display:**
  - Code snippet preview as label (trimmed source code line).
  - Relative workspace path and 1-based line number (`src/service.ts:42`) as description.
  - Descriptive tooltips and native Codicons (`references`, `call-incoming`, `type-hierarchy-sub`).
- **Universal Multi-Selection (`canSelectMany: true`):**
  - Selecting multiple files aggregates the union of their types in downstream panes.
  - Selecting multiple types aggregates the union of their members.
  - Selecting multiple members computes combined references, callers, or implementations.
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
│  │  │ Native Pane 1: Files (`facet.pane.1`)                [⚙]   │  │  │
│  │  │    [Input: Global] [Selection: Cursor]                     │  │  │
│  │  │    - src/order.ts                                          │  │  │
│  │  │    - src/payment.ts                                        │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 2: Types (`facet.pane.2`)                [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Display: Hierarchy]             │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 3: Members (`facet.pane.3`)              [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Filters: Methods, Fields]       │  │  │
│  │  │    - #processPayment()                                     │  │  │
│  │  │    - #validateOrder()                                      │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: References (`facet.pane.4`)           [⚙]   │  │  │
│  │  │    [Input: Previous Pane] [Readable Snippets + Paths]      │  │  │
│  │  │    - orderService.processPayment(cart) src/cart.ts:42      │  │  │
│  │  │    - testProcessPayment()              test/cart.test.ts:18│  │  │
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
    - Problems
    - Changes
  - *Input Source:*
    - Project (for files, directories, types, problems, changes)
    - Open Editors (for files, directories, types, members, problems, changes)
    - Active Error (for types, members, problems, changes)
    - Previous Pane (for files, directories, types, members, definitions, declarations, implementations, problems, changes)
  - *Selection Source:*
    - All (selects everything by default)
    - None (selects nothing by default)
    - Cursor (selects the item under the cursor)
  - *Filter:* 
    - For files/directories this is a glob pattern 
    - For types/members/definitions/declarations/implementations/references this is toggles across 26 symbol kinds
  - *Sort by:* 
    - Position
    - Name
    - Category
  - *Display:* 
    - Flat vs Hierarchy (for files, directories, types, members)
    - ... 
  - (horizontal separator)
  - *Add Pane*: Append new pane to the end.
  - *Remove Pane*: Removes the current pane.
  - (horizontal separator)
  - *Apply Preset*:
    - Project Browser (default): directories (hierarchical) -> files -> types (hierarchical) -> members
    - Implementors: types -> members -> implementors
    - Callers: types -> members -> callers
    - References: types -> members -> references
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
   - Drag and drop views in VS Code workbench: verify upstream data flow remains linked via role-based fallbacks and explicit `inputPaneId`.
   - Select `Project Browser` preset: confirm Pane 1 shows global project types, Pane 2 shows members, and Pane 3 shows readable code snippets in references.
