# AGENTS.md — Facet Architecture & Implementation Guide (Unified Native Edition)

## 1. Executive Summary & Design Principles

**Facet** is a structural, configurable code navigation deck built natively for Visual Studio Code using standard `TreeView` and `TreeDataProvider` components. Instead of cluttering the interface with dozens of single-purpose panels or relying on heavy custom webviews, Facet provides a **single, unified, highly configurable navigation deck** composed of native lists, trees, and interactive filter controls.

### Core Principles

- **100% Native VS Code UI:** Zero webviews, zero runtime overhead. All UI elements use native tree views with built-in fuzzy filtering (`Cmd+F`), native Codicons, and keyboard accessibility.
- **Unified Single-Panel Deck:** Housed in the Primary Sidebar, Secondary Sidebar, or Bottom Panel. Composable sections present the exact structural facets needed (Types, Categories/Kinds, Members, Relations).
- **Categorization via Member Kinds:** Replaces arbitrary protocols with concrete member kinds (Constants, Fields, Constructors, Instance Methods, Static Methods, Accessors).
- **Smalltalk-Style Controls:** Instant toggles for **Instance vs. Class (Static)** side, **Flat vs. Inherited** hierarchy, and **Tree vs. List** views.
- **Universal Multi-Selection:** Multi-select enabled across all sections (`canSelectMany: true`). Selecting multiple types yields the aggregated union of their members; selecting multiple members computes combined relations.
- **Resilient & Non-Blocking:** Caching keyed by `(uri, document.version)`, debounced background synchronization with `CancellationTokenSource`, and tiered LSP fallbacks down to primitive text parsing.

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
│  │ Unified Facet Navigation Deck (`facet-container`)                │  │
│  │                                                                  │  │
│  │  [Toolbar: Scope | Flat/Tree | Instance/Class Toggle | Kind Filter] │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ 1. Types Section (`facet.views.types`)                     │  │  │
│  │  │    Classes, Interfaces, Enums, Structs (Multi-Select)      │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 2. Categories Section (`facet.views.categories`)           │  │  │
│  │  │    [All] [Constructors] [Fields] [Methods] [Static]        │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 3. Members Section (`facet.views.members`)                 │  │  │
│  │  │    Selectors & Fields (Union of selected types)            │  │  │
│  │  ├────────────────────────────────────────────────────────────┤  │  │
│  │  │ 4. Relations Section (`facet.views.relations`)             │  │  │
│  │  │    Senders, Callers, Implementors (Union of members)       │  │  │
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

## 3. Structural Model & Predefined Profiles

### 3.1. Member Kinds & Smalltalk Toggles

Symbols are categorized into standardized, filterable **Member Kinds**:

- **Constants / Enums:** `const MAX`, `enum Status`
- **Fields / Properties:** `private id: string`, `double radius`
- **Constructors / Factories:** `constructor()`, `factory Logger.from()`
- **Instance Methods:** `render()`, `calculateTotal()`
- **Static / Class Methods:** `static parse()`, `@classmethod create()`
- **Accessors:** `get size()`, `set count(val)`
- **Operators / Special:** `operator +`, `__repr__`

#### Toggles

- **Side Switch (`facet.side`):**
  - `instance`: Instance methods, properties, accessors, constructors.
  - `class`: Static methods, constants, class-level factories.
  - `both`: All members without side-filtering.
- **Hierarchy Mode (`facet.hierarchy`):**
  - `flat`: Directly declared members only.
  - `inherited`: Members inherited from base classes and interfaces.
- **Layout Mode (`facet.layout`):**
  - `list`: Flat selector list.
  - `tree`: Nested namespaces / classes / members.

### 3.2. Universal Multi-Selection & Union Semantics

- `canSelectMany: true` is configured on all tree views.
- **Multiple Types Selected:** Section 3 displays the **union** of members across all selected types.
- **Multiple Members Selected:** Section 4 computes the **union** of call sites or implementations across all selected members.

### 3.3. Predefined Profiles

1. **Smalltalk System Browser:** Types (with Instance/Class toggle) $\to$ Member Categories $\to$ Members.
2. **Smalltalk Implementors Browser:** Unique workspace selectors $\to$ Implementing types $\to$ Overrides and source.
3. **Smalltalk Senders (Callers) Browser:** Target selector $\to$ Caller methods grouped by class $\to$ Call site previews.
4. **File Structure Browser:** Compact outline of the active document with instant kind-filtering.

---

## 4. Tiered Semantic Resolution & Fallback Engine

```text
[Request Symbols]
       │
       ▼
 [Tier 1: Hierarchical LSP] ──(Success: DocumentSymbol[])───────► [Facet Symbol Graph]
       │ (Not supported / returns empty)
       ▼
 [Tier 2: Flat LSP]          ──(Success: SymbolInformation[])────► [Container Grouping] ──► [Facet Symbol Graph]
       │ (Not supported / returns empty)
       ▼
 [Tier 3: Primitive Fallback] ──(Regex / Indentation Parser)─────► [Synthesized Nodes]   ──► [Facet Symbol Graph]
```

1. **Tier 1 (Hierarchical LSP):** Preserves explicit parent-child trees from `vscode.executeDocumentSymbolProvider`.
2. **Tier 2 (Flat LSP):** Groups `vscode.SymbolInformation[]` by `containerName` to reconstruct a synthetic tree.
3. **Tier 3 (Primitive Fallback):** Regex-based grammar matcher extracts basic classes, functions, and methods when language servers are absent.

---

## 5. Non-Blocking Synchronization & Caching

1. **Document Version Caching:** Cache parsed symbol graphs keyed by `(uri.toString(), document.version)`.
2. **Debounced Caret Tracking:** Debounce `onDidChangeTextEditorSelection` by 150ms.
3. **Cancellation Token Integration:** Cancel pending LSP requests via `vscode.CancellationTokenSource` when the user navigates quickly.

---

## 6. Implementation Architecture

### Step 1: Manifest Contributions (`package.json`)

```json
{
  "name": "facet-code",
  "displayName": "Facet Code",
  "description": "Structural, configurable code browser for VS Code.",
  "version": "0.1.0",
  "main": "./out/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "facet-container",
          "title": "Facet",
          "icon": "media/facet-logo.png"
        }
      ]
    },
    "views": {
      "facet-container": [
        {
          "id": "facet.views.types",
          "name": "Types",
          "icon": "$(symbol-class)"
        },
        {
          "id": "facet.views.categories",
          "name": "Categories",
          "icon": "$(filter)"
        },
        {
          "id": "facet.views.members",
          "name": "Members",
          "icon": "$(symbol-method)"
        },
        {
          "id": "facet.views.relations",
          "name": "Relations",
          "icon": "$(references)"
        }
      ]
    },
    "commands": [
      {
        "command": "facet.toggleSide",
        "title": "Facet: Toggle Instance / Class Side",
        "icon": "$(arrow-swap)"
      },
      {
        "command": "facet.toggleHierarchy",
        "title": "Facet: Toggle Flat / Inherited Hierarchy",
        "icon": "$(type-hierarchy)"
      },
      {
        "command": "facet.toggleLayout",
        "title": "Facet: Toggle Flat / Tree Layout",
        "icon": "$(list-tree)"
      },
      {
        "command": "facet.switchProfile",
        "title": "Facet: Switch View Profile",
        "icon": "$(layout)"
      },
      {
        "command": "facet.revealRange",
        "title": "Facet: Reveal in Editor"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "facet.toggleSide",
          "when": "view == facet.views.members || view == facet.views.types",
          "group": "navigation@1"
        },
        {
          "command": "facet.toggleHierarchy",
          "when": "view == facet.views.members || view == facet.views.types",
          "group": "navigation@2"
        },
        {
          "command": "facet.toggleLayout",
          "when": "view == facet.views.members",
          "group": "navigation@3"
        },
        {
          "command": "facet.switchProfile",
          "when": "view == facet.views.types",
          "group": "navigation@4"
        }
      ]
    }
  }
}
```

---

### Step 2: Normalized Symbol Models (`src/models/symbolNode.ts`)

```typescript
import * as vscode from 'vscode';

export enum MemberCategory {
  All = 'all',
  Constants = 'constants',
  Fields = 'fields',
  Constructors = 'constructors',
  InstanceMethods = 'instanceMethods',
  StaticMethods = 'staticMethods',
  Accessors = 'accessors',
  Special = 'special'
}

export type ClassSide = 'instance' | 'class' | 'both';

export interface FacetSymbolNode {
  name: string;
  detail?: string;
  kind: vscode.SymbolKind;
  uri: vscode.Uri;
  range: vscode.Range;
  selectionRange: vscode.Range;
  category: MemberCategory;
  isStatic: boolean;
  children: FacetSymbolNode[];
  parent?: FacetSymbolNode;
}
```

---

### Step 3: Tiered Normalizer & Resolver (`src/services/symbolResolver.ts`)

```typescript
import * as vscode from 'vscode';
import { FacetSymbolNode, MemberCategory } from '../models/symbolNode';

export class SymbolResolver {
  private cache = new Map<string, { version: number; symbols: FacetSymbolNode[] }>();

  async resolveDocumentSymbols(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken
  ): Promise<FacetSymbolNode[]> {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === document.version) {
      return cached.symbols;
    }

    let nodes: FacetSymbolNode[] = [];

    // Tier 1 & 2: LSP Query
    const rawSymbols = await vscode.commands.executeCommand<
      (vscode.DocumentSymbol | vscode.SymbolInformation)[]
    >('vscode.executeDocumentSymbolProvider', document.uri);

    if (token?.isCancellationRequested) return [];

    if (rawSymbols && rawSymbols.length > 0) {
      if ('children' in rawSymbols[0]) {
        nodes = (rawSymbols as vscode.DocumentSymbol[]).map((s) => this.fromDocumentSymbol(s, document.uri));
      } else {
        nodes = this.fromSymbolInformations(rawSymbols as vscode.SymbolInformation[], document.uri);
      }
    } else {
      // Tier 3: Primitive Fallback Parser
      nodes = this.fallbackParse(document);
    }

    this.cache.set(key, { version: document.version, symbols: nodes });
    return nodes;
  }

  private fromDocumentSymbol(sym: vscode.DocumentSymbol, uri: vscode.Uri): FacetSymbolNode {
    const category = this.categorize(sym.kind, sym.detail);
    const isStatic = sym.detail?.includes('static') ?? false;

    return {
      name: sym.name,
      detail: sym.detail,
      kind: sym.kind,
      uri,
      range: sym.range,
      selectionRange: sym.selectionRange,
      category,
      isStatic,
      children: sym.children ? sym.children.map((c) => this.fromDocumentSymbol(c, uri)) : []
    };
  }

  private fromSymbolInformations(syms: vscode.SymbolInformation[], uri: vscode.Uri): FacetSymbolNode[] {
    const containerMap = new Map<string, FacetSymbolNode[]>();
    const roots: FacetSymbolNode[] = [];

    for (const s of syms) {
      const node: FacetSymbolNode = {
        name: s.name,
        kind: s.kind,
        uri,
        range: s.location.range,
        selectionRange: s.location.range,
        category: this.categorize(s.kind),
        isStatic: false,
        children: []
      };

      if (!s.containerName) {
        roots.push(node);
      } else {
        const list = containerMap.get(s.containerName) || [];
        list.push(node);
        containerMap.set(s.containerName, list);
      }
    }

    for (const root of roots) {
      root.children = containerMap.get(root.name) || [];
    }

    return roots;
  }

  private fallbackParse(document: vscode.TextDocument): FacetSymbolNode[] {
    const nodes: FacetSymbolNode[] = [];
    const text = document.getText();
    const classRegex = /(?:class|interface|struct|enum)\s+([A-Za-z0-9_]+)/g;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(text)) !== null) {
      const pos = document.positionAt(match.index);
      const range = new vscode.Range(pos, pos);
      nodes.push({
        name: match[1],
        kind: vscode.SymbolKind.Class,
        uri: document.uri,
        range,
        selectionRange: range,
        category: MemberCategory.All,
        isStatic: false,
        children: []
      });
    }

    return nodes;
  }

  private categorize(kind: vscode.SymbolKind, detail?: string): MemberCategory {
    const isStatic = detail?.toLowerCase().includes('static');
    if (isStatic) return MemberCategory.StaticMethods;

    switch (kind) {
      case vscode.SymbolKind.Constant:
      case vscode.SymbolKind.Enum:
      case vscode.SymbolKind.EnumMember:
        return MemberCategory.Constants;
      case vscode.SymbolKind.Field:
      case vscode.SymbolKind.Property:
      case vscode.SymbolKind.Variable:
        return MemberCategory.Fields;
      case vscode.SymbolKind.Constructor:
        return MemberCategory.Constructors;
      case vscode.SymbolKind.Method:
      case vscode.SymbolKind.Function:
        return MemberCategory.InstanceMethods;
      default:
        return MemberCategory.Special;
    }
  }
}
```

---

### Step 4: Tree Providers with Multi-Select & Union Support

Each view section implements `vscode.TreeDataProvider` supporting `canSelectMany: true`:

1. **`TypesTreeProvider` (`facet.views.types`):**
   - Emits selection change events to coordinator.
2. **`CategoriesTreeProvider` (`facet.views.categories`):**
   - Displays selectable categories: `[All]`, `[Constructors]`, `[Fields]`, `[Methods]`, `[Static]`.
3. **`MembersTreeProvider` (`facet.views.members`):**
   - Computes set union of members belonging to all selected types.
   - Filters according to active category and Instance/Class side toggle.
4. **`RelationsTreeProvider` (`facet.views.relations`):**
   - Computes set union of incoming callers and references across all selected members.

---

### Step 5: FacetCoordinator and Extension Lifecycle (`src/extension.ts`)

- Coordinates selection propagation between sections.
- Houses state: `activeProfile`, `selectedTypes`, `selectedCategory`, `selectedMembers`, `classSide`, `hierarchyMode`.
- Debounces active editor synchronization by 150ms.
- Cancels previous pending requests on cursor moves using `CancellationTokenSource`.

---

## 7. Verification & Testing Procedure

1. Run `npm run compile`.
2. Launch Extension Host (`Cmd+F5`).
3. Open a TypeScript or Dart workspace.
4. Inspect the **Facet** container in the Activity Bar:
   - Select multiple classes in **Types**: confirm **Members** displays the aggregated union of methods across all selected classes.
   - Click the **Instance / Class Side** toggle: confirm static methods/constants appear when switched to class side.
   - Select a member category (e.g. `Constructors`): confirm members filter down immediately.
   - Select multiple methods in **Members**: confirm **Relations** aggregates call sites across all selected methods.
   - Rapidly move caret across a large file: confirm background requests are non-blocking and cancel cleanly.
