# AGENTS.md — Facet Architecture & Implementation Guide (Exclusively Native Dynamic Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built **100% natively for Visual Studio Code**.

### Core Non-Negotiable Principles
- **Exclusively Native VS Code UI:** Zero webviews, zero HTML/DOM, zero web runtime overhead. All UI elements are standard `vscode.TreeView` and `vscode.TreeDataProvider` components with native keyboard navigation, theming, Codicons, badges, and inline/title actions.
- **Dynamic Native Pane Pipeline:** Up to 6 configurable native pane slots (`facet.pane.1` .. `facet.pane.6`) hosted inside the `facet-container` Activity Bar view container:
  - **Add Panes on the fly (`facet.pane.add` `$(add)`):** Enable additional native panes and select their role via QuickPick.
  - **Remove Panes on the fly (`facet.pane.remove` `$(trash)`):** Hide unwanted panes.
  - **Reconfigure Panes on the fly (`facet.pane.configure` `$(gear)`):** Change pane role (Types, Categories, Members, Relations), switch scope, side filter, or layout mode.
  - **Reorder Panes (`facet.pane.moveUp` / `facet.pane.moveDown`):** Shift panes earlier or later in the pipeline.
  - **Predefined Presets (`facet.pane.presets` `$(layers)`):** Smalltalk System Browser, Implementors Browser, Senders Browser, Compact Outline.
- **Smalltalk-Style Controls:** Instant toggles for:
  - **File vs. Project Scope (`facet.toggleScope` 🌐):** Current active file vs. entire workspace symbol index with multi-tier file AST scanning and lazy member hydration.
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
│  │   - Workspace Scanner  │         │ - PanePipelineManager         │  │
│  └────────────────────────┘         └──────────────┬────────────────┘  │
│                                                    │ State & Projections│
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 100% Native Facet Navigation Deck (`facet-container`)            │  │
│  │                                                                  │  │
│  │  [Toolbar: + Add Pane | Presets | Configure ⚙ | Move ⮃ | Scope 🌐] │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Native Pane 1: Types (`facet.pane.1`)                      │  │  │
│  │  │    [Scope: File/Project 🌐] [Hierarchy: Flat/Inherited]    │  │  │
│  │  │    - Class OrderService                                    │  │  │
│  │  │    - Class PaymentProcessor                                │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 2: Categories (`facet.pane.2`)                 │  │  │
│  │  │    - [All Members] (14)                                    │  │  │
│  │  │    - Constructors (2)                                      │  │  │
│  │  │    - Fields & Properties (4)                               │  │  │
│  │  │    - Instance Methods (6)                                  │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 3: Members (`facet.pane.3`)                    │  │  │
│  │  │    [Layout: List/Tree ☷]                                   │  │  │
│  │  │    - #processPayment()                                     │  │  │
│  │  │    - #validateOrder()                                      │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ Native Pane 4: Relations (`facet.pane.4`)                  │  │  │
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

## 3. Structural Model & Native Actions

### Native Pane Pipeline Controls
- **`facet.pane.add` (`$(add)`):** Opens native QuickPick to choose a role (`Types`, `Categories`, `Members`, `Relations`) and activates the next native pane slot.
- **`facet.pane.remove` (`$(trash)`):** Removes/hides a pane from the active pipeline.
- **`facet.pane.configure` (`$(gear)`):** Native menu to change the pane's role, scope, layout, or rename it.
- **`facet.pane.moveUp` (`$(arrow-up)`) / `facet.pane.moveDown` (`$(arrow-down)`):** Reorders panes in the pipeline.
- **`facet.pane.presets` (`$(layers)`):** QuickPick for predefined pipelines (`Smalltalk System Browser`, `Implementors`, `Senders`, `Compact Outline`).
- **`facet.toggleScope` (`$(globe)`):** Toggles between active document AST and project-wide symbol index (configured via `facet.types.scope`).
- **`facet.toggleHierarchy` (`$(type-hierarchy)`):** Toggles between `flat` and `inherited`.
- **`facet.toggleLayout` (`$(list-tree)`):** Toggles between flat sorted `list` and nested `tree`.
- **`facet.relations.switchMode` (`$(settings)`):** QuickPick for `references`, `callers`, or `implementations`.
- **`facet.revealRange`:** Navigates the active text editor to the target symbol range.

---

## 4. Robust Workspace Type Discovery & Hydration

1. **Workspace Symbol Query:** First executes `vscode.executeWorkspaceSymbolProvider`.
2. **Workspace AST File Scanner Fallback:** When language servers return empty results for empty queries (e.g. `tsserver`), Facet discovers workspace files (`vscode.workspace.findFiles`) and extracts type declarations (`class`, `interface`, `enum`, `struct`) using multi-tier AST resolution and cached regex parsing.
3. **Lazy Member Hydration:** When a project type is selected, Facet lazily hydrates all its members, constructors, and fields on demand.
4. **Debounce & Invalidation:** Caret tracking is debounced by 150ms, cached by `(uri, document.version)`, and cancellable via `CancellationTokenSource`.

---

## 5. Verification & Testing

1. Run `npm test` to verify unit test suite across all native models, providers, and pipeline managers.
2. Launch Extension Host (`Cmd+F5`).
3. Verify native dynamic behavior:
   - Click `+ Add Pane` in the view title: choose `Relations` and confirm a new native pane appears.
   - Click `⚙ Configure Pane`: change role or layout and confirm instant update.
   - Click `Move Pane Up / Down`: confirm pane positions swap smoothly.
   - Click `Toggle Scope` (`🌐`): confirm switching to Project mode populates all classes across the workspace.
   - Select any class: confirm `Members` immediately hydrates with its methods.
