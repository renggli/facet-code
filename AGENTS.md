# AGENTS.md — Facet Architecture & Implementation Guide (Exclusively Native Dynamic Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

### Core Non-Negotiable Principles

- **Exclusively Native VS Code UI:** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline actions.
- **Always-On Clarity & Navigation:** Symbol icons, contextual details (signatures, locations), and auto-reveal on click/selection are permanently enabled natively with zero toggle overhead.
- **Dynamic Native Pane Pipeline:** Up to 6 configurable native pane slots (`facet.pane.1` .. `facet.pane.6`) hosted inside the `facet-container` Activity Bar view container:
  - **Single Contextual Menu per Pane (`facet.pane.configure` `$(gear)`):** Clean, uncluttered pane headers replacing bars of individual action icons.
  - **General Settings:**
    - **Title:** Custom label for each pane.
    - **Type of Pane:** `Files`, `Types`, `Members`, `References`, `Implementations`, `Callers`, `Hierarchy`.
    - **Input Source:** `Global` (workspace-wide symbols or files, default for first pane), `File` (active editor symbols or current file), or `Pane` (symbols/files from previous visible pane, applicable to downstream panes). Only applicable options are presented.
    - **Selection Source:** `Cursor` (editor cursor symbol or active file, automatically selecting corresponding enclosing items across all previous panes), `All` (selects all symbols/files in pane), or `None` (manual selection only).
    - **Sort:** `Alphabetical`, `File Order`, or `Grouped` (where applicable).
    - **Regexp Filter:** Regular expression pattern for filtering files (when pane role is `Files`).
    - **Filters:** Granular toggles across all 26 VS Code symbol kinds (`class`, `interface`, `enum`, `method`, `field`, `function`, etc.).
    - **Display Mode:** `Flat` vs. `Hierarchy` (with selectable subclass types for applicable type panes).
  - **Pipeline Settings:**
    - *Add Previous Pane:* Insert a new pane immediately before this pane in the pipeline.
    - *Add Next Pane:* Insert a new pane immediately after this pane in the pipeline.
    - *Remove Pane:* Hide this pane from the pipeline (enforcing minimum 1 visible pane).
- **Predefined Presets (`facet.pane.presets`):**
  - **Project Browser:** Global Types (`global`) -> Members (`pane`) -> References (`pane`).
  - **Implementations Browser:** Global Types (`global`) -> Members (`pane`) -> Implementations (`pane`).
  - **Callers Browser:** Global Types (`global`) -> Members (`pane`) -> Callers (`pane`).
  - **Compact Outline:** Active File Types (`file`) -> Members (`pane`).
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
  - *Type of Pane:* Files, Types, Members, References, Implementations, Callers, Hierarchy.
  - *Input Source:* Global, File, Pane (filtered to valid context).
  - *Selection Source:* Cursor, All, None.
  - *Sort:* Alphabetical, File Order, Grouped.
  - *Regexp Filter:* File pattern filtering for `Files` role.
  - *Filters:* Granular symbol kind toggles across 26 symbol kinds.
  - *Display:* Flat vs. Hierarchy (with subclass kinds selector).
  - *Add Previous Pane:* Insert pane before current slot.
  - *Add Next Pane:* Insert pane after current slot.
  - *Remove Pane:* Hide current pane.
  - *Apply Preset:* QuickPick for Project Browser, Implementations, Callers, Compact Outline.
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
   - Click `Add Next Pane`: select `Callers` and confirm a new pane is inserted in sequence.
   - Click `Remove Pane`: confirm pane is hidden.
   - Select `Project Browser` preset: confirm Pane 1 shows global project types, Pane 2 shows members, and Pane 3 shows readable code snippets in references.
