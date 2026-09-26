# AGENTS.md — Facet Architecture & Implementation Guide (Exclusively Native Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

### Core Non-Negotiable Principles
- **Exclusively Native VS Code UI:** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline/title actions.
- **Unified 4-Pane Structural Deck:** Housed cleanly inside the `facet-container` Activity Bar view container:
  1. **`Types` (`facet.views.types`):** Classes, interfaces, enums, structs with scope toggle (**File** vs. **Project** AST) and multi-selection.
  2. **`Categories` (`facet.views.categories`):** Concrete member kinds (Constructors, Fields, Instance Methods, Static Methods, Accessors) with dynamic symbol counts.
  3. **`Members` (`facet.views.members`):** Selectors and properties computed as the set union of selected types, filtered by active category and side.
  4. **`Relations` (`facet.views.relations`):** Cross-workspace usages (References, Callers/Senders, Implementations) computed as the union across selected members.
- **Smalltalk-Style Controls:** Instant toggles for:
  - **File vs. Project Scope (`facet.toggleScope`):** Current active file vs. entire workspace symbol index with lazy member hydration.
  - **Instance vs. Class Side (`facet.toggleSide`):** Instance methods/properties vs. static methods/constants.
  - **Flat vs. Inherited Hierarchy (`facet.toggleHierarchy`):** Directly declared vs. inherited members.
  - **Flat vs. Tree Layout (`facet.toggleLayout`):** Alphabetical selector list vs. structured member tree.
- **Universal Multi-Selection (`canSelectMany: true`):** Selecting multiple types aggregates the union of their members; selecting multiple members computes combined references or callers.
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
│  └────────────────────────┘         └──────────────┬────────────────┘  │
│                                                    │ State & Projections│
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 100% Native Facet Navigation Deck (`facet-container`)            │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ 1. Types (`facet.views.types`) - Multi-Select              │  │  │
│  │  │    [Scope: File/Project 🌐] [Hierarchy: Flat/Inherited]    │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 2. Categories (`facet.views.categories`)                   │  │  │
│  │  │    - [All Members] (14)                                    │  │  │
│  │  │    - Constructors (2)                                      │  │  │
│  │  │    - Fields & Properties (4)                               │  │  │
│  │  │    - Instance Methods (6)                                  │  │  │
│  │  │    - Static Methods (2)                                    │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 3. Members (`facet.views.members`) - Multi-Select          │  │  │
│  │  │    [Side: Instance/Class ⮂] [Layout: List/Tree ☷]          │  │  │
│  │  │    - #processPayment()                                     │  │  │
│  │  │    - #validateOrder()                                      │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 4. Relations (`facet.views.relations`)                     │  │  │
│  │  │    [Mode Switcher: References / Callers / Implementors ⚙]  │  │  │
│  │  │    - CheckoutController.submit() -> #processPayment()      │  │  │
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

## 3. Structural Model & Categories

Symbols are categorized into standardized **Member Kinds**:
- **Constants / Enums:** `const MAX`, `enum Status`
- **Fields / Properties:** `private id: string`, `double radius`
- **Constructors / Factories:** `constructor()`, `factory Logger.from()`
- **Instance Methods:** `render()`, `calculateTotal()`
- **Static / Class Methods:** `static parse()`, `@classmethod create()`
- **Accessors:** `get size()`, `set count(val)`

### Native Action Controls
- **`facet.toggleScope` (`$(globe)`):** Toggles between active document AST and workspace-wide symbol index (configured via `facet.types.scope`).
- **`facet.toggleSide` (`$(arrow-swap)`):** Toggles between `instance`, `class`, and `both`.
- **`facet.toggleHierarchy` (`$(type-hierarchy)`):** Toggles between `flat` and `inherited`.
- **`facet.toggleLayout` (`$(list-tree)`):** Toggles between flat sorted `list` and nested `tree`.
- **`facet.relations.switchMode` (`$(settings)`):** QuickPick for `references`, `callers`, or `implementations`.
- **`facet.revealRange`:** Navigates the active text editor to the target symbol range.

---

## 4. Tiered LSP Normalization & Caching

1. **Tier 1 (Hierarchical LSP):** Preserves native parent-child trees from `vscode.executeDocumentSymbolProvider`.
2. **Tier 2 (Flat LSP):** Groups `vscode.SymbolInformation[]` by `containerName` to synthesize parent-child hierarchies.
3. **Tier 3 (Primitive Fallback):** Regex-based grammar parser extracts classes and member symbols when language servers are unavailable.
4. **Workspace Hydration:** Workspace symbol queries (`vscode.executeWorkspaceSymbolProvider`) populate type lists; selecting a type lazily hydrates its member children on demand.
5. **Debounce & Invalidation:** Caret movements are debounced by 150ms, cached by `(uri, document.version)`, and cancellable via `CancellationTokenSource`.

---

## 5. Verification & Testing

1. Run `npm test` to verify unit test suite across all native models, providers, and coordinators.
2. Launch Extension Host (`Cmd+F5`).
3. Verify native behavior:
   - Click gemstone icon in Activity Bar: confirm native VS Code TreeViews appear without any webview frame.
   - Click `Toggle Scope` (`🌐`): confirm switching between single file and workspace-wide project classes.
   - Select multiple classes: confirm `Members` displays the merged union of methods.
   - Click `Toggle Side` (`⮂`): confirm instant filtering between instance and static/class side.
   - Click `Categories`: confirm instant filtering down to constructors, fields, or methods.
   - Select a member: confirm `Relations` populates with references or incoming callers.
   - Click any tree item: confirm editor smoothly reveals and highlights the symbol.
