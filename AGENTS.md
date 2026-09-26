# AGENTS.md — Facet Architecture & Implementation Guide (Dynamic Configurable Pipeline Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck for Visual Studio Code. Rather than locking users into a rigid layout, Facet models code navigation as an **interactive, on-the-fly configurable pipeline** of composable stages ($S_0 \to S_1 \to \dots \to S_k$).

### Core Capabilities
- **Dynamic Topology:** Add, remove, reorder, and configure stages on the fly.
- **Bi-directional Layout Orientation:**
  - **Left-to-Right (`horizontal` / Miller columns):** Cascading columns side-by-side.
  - **Top-to-Bottom (`vertical` / stacked):** Hierarchical vertical chain.
- **Polymorphic Display Modes:** Each stage can render as a **flat list**, **collapsible tree**, or **filter chips / toggle buttons**.
- **Per-Stage Configuration Menu:** Every stage features a dedicated configuration menu controlling:
  - Data Source (Types, Categories/Kinds, Members, References, Callers, Implementations).
  - Component Mode (`list`, `tree`, `chips`).
  - Selection Mode (`single`, `multi` with set union propagation).
  - Member Filters (Instance vs. Class side, Category filter, Visibility).
  - Sorting (`name`, `position`, `kind`).
  - Selection Action (`filter-next`, `reveal-in-editor`, `both`).
- **Resilient & Non-Blocking:** Document version caching, debounced background synchronization with `CancellationTokenSource`, and tiered LSP fallbacks.

---

## 2. System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        VS Code Host Environment                        │
│                                                                        │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   LSP Engines / Parser │         │ FacetPipelineEngine           │  │
│  │   - Tier 1: Tree LSP   │◄───────►│ - Evaluates stage pipeline    │  │
│  │   - Tier 2: Flat LSP   │         │ - Debounced background sync   │  │
│  │   - Tier 3: Regex/Text │         │ - On-the-fly stage reconfig   │  │
│  └────────────────────────┘         └──────────────┬────────────────┘  │
│                                                    │ State & Projections│
│                                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Unified Facet Navigation Deck (`facet-container`)                │  │
│  │                                                                  │  │
│  │  [Toolbar: + Add Stage | Orientation: ⮂ H / ⮃ V | Presets ]     │  │
│  │                                                                  │  │
│  │  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────┐ │  │
│  │  │ Stage 0: Types     │  │ Stage 1: Kinds     │  │ Stage 2: ...│ │  │
│  │  │ [⚙ Menu] [✕ Remove]│  │ [⚙ Menu] [✕ Remove]│  │ [⚙ Menu]    │ │  │
│  │  ├────────────────────┤  ├────────────────────┤  ├─────────────┤ │  │
│  │  │ Class Foo (multi)  │  │ [All] [Methods]    │  │ #bar()      │ │  │
│  │  │ Class Bar (multi)  │  │ [Constructors]     │  │ #baz()      │ │  │
│  │  └────────────────────┘  └────────────────────┘  └─────────────┘ │  │
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

## 3. Data Model: Pipeline & Stages

### 3.1. Stage Configuration (`FacetStageConfig`)

```typescript
export type StageDisplayMode = 'list' | 'tree' | 'chips';
export type PipelineOrientation = 'horizontal' | 'vertical';

export type StageDataSource =
  | 'document.types'
  | 'document.categories'
  | 'document.symbols'
  | 'members.filtered'
  | 'relations.references'
  | 'relations.callers'
  | 'relations.implementations';

export interface FacetStageConfig {
  id: string;
  title: string;
  source: StageDataSource;
  displayMode: StageDisplayMode;
  allowMultiSelect: boolean;
  classSide: 'instance' | 'class' | 'both';
  categoryFilter: string;
  sortBy: 'name' | 'position' | 'kind';
  revealOnSelect: boolean;
}

export interface FacetPipelineConfig {
  id: string;
  name: string;
  orientation: PipelineOrientation;
  stages: FacetStageConfig[];
}
```

---

## 4. Predefined Pipeline Profiles

1. **Smalltalk System Browser Profile:**
   - Stage 0: `document.types` (List, multi-select).
   - Stage 1: `document.categories` (Chips / Filter buttons).
   - Stage 2: `members.filtered` (List, single/multi-select, reveal on select).
   - Orientation: `horizontal` (Miller columns) or `vertical`.
2. **Implementors Profile:**
   - Stage 0: `document.symbols` (Selectors list).
   - Stage 1: `relations.implementations` (Tree of implementing types).
3. **Senders (Callers) Profile:**
   - Stage 0: `document.symbols` (Target selector).
   - Stage 1: `relations.callers` (Tree of calling functions & occurrences).

---

## 5. Dynamic Manipulation & Menu Controls

Each stage exposes:
- **`facet.toggleScope`**: Toggles between `file` (active document AST) and `project` (workspace symbols with lazy member hydration). Configured via `facet.types.scope`.
- **`facet.stage.configure`**: QuickPick menu to edit title, data source, display mode (list/tree/chips), side filter, and sort order.
- **`facet.stage.moveLeft` / `facet.stage.moveUp`**: Shifts stage position earlier in pipeline.
- **`facet.stage.moveRight` / `facet.stage.moveDown`**: Shifts stage position later in pipeline.
- **`facet.stage.remove`**: Removes stage from pipeline.
- **`facet.pipeline.addStage`**: Appends or inserts a new stage with chosen data source.
- **`facet.pipeline.toggleOrientation`**: Toggles between `horizontal` (left-to-right columns) and `vertical` (top-to-bottom stack).
- **`facet.pipeline.switchPreset`**: Loads a predefined pipeline profile.

---

## 6. Verification & Testing

1. Run `npm test` to verify pipeline stage evaluation, dynamic addition, removal, and reordering.
2. Launch Extension Host (`Cmd+F5`).
3. Verify on-the-fly customization:
   - Add new stage $\to$ choose data source $\to$ confirm immediate pipeline re-computation.
   - Reorder stages $\to$ confirm downstream selection propagation updates cleanly.
   - Switch orientation between left-to-right and top-to-bottom.
   - Open stage menu $\to$ toggle list/tree/chips or instance/class side.
