import * as vscode from 'vscode';
import {
  ALL_SYMBOL_FILTER_OPTIONS,
  createDefaultFilters,
  type HierarchyPaneConfig,
  matchesPaneFilters,
  type SymbolKindKey,
} from '../../models/paneConfig';
import {
  buildTypeHierarchy,
  type FacetSymbolNode,
  getSymbolIcon,
  isTypeKind,
  MemberCategory,
  sortSymbolNodes,
} from '../../models/symbolNode';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export class HierarchyPaneDefinition implements PaneDefinition<HierarchyPaneConfig, FacetSymbolNode> {
  public readonly role = 'hierarchy';
  public readonly title = 'Hierarchy';
  public readonly icon = 'type-hierarchy';
  public readonly description = 'Type inheritance and subtype hierarchy';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSelections: ['cursor', 'all', 'none'],
    supportedSorts: ['position', 'name', 'category'],
    hasTreeToggle: true,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): HierarchyPaneConfig {
    return {
      id: slotId,
      role: 'hierarchy',
      title: 'Hierarchy',
      visible: true,
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      filters: createDefaultFilters(),
      tree: true,
      subclassTypes: ['class', 'struct'],
    };
  }

  public async getChildren(
    context: PaneExecutionContext<HierarchyPaneConfig>,
    element?: FacetSymbolNode,
  ): Promise<FacetSymbolNode[]> {
    const config = context.config;
    const isTree = Boolean(config.tree);
    const filters = config.filters;
    const subclassTypes = config.subclassTypes;

    if (element) {
      if (isTree) {
        if (!element.subTypes || element.subTypes.length === 0) {
          const lspSubtypes = await context.coordinator.resolver.resolveTypeHierarchySubtypes(
            element,
            context.cancellationToken,
          );
          if (lspSubtypes.length > 0) {
            element.subTypes = lspSubtypes;
          }
        }
        const subTypes = element.subTypes ?? [];
        const filtered = subTypes.filter((c) => isTypeKind(c.kind) && matchesPaneFilters(c, filters));
        return sortSymbolNodes(filtered, config.sort);
      }
      return [];
    }

    let rawTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'project') {
      let workspaceTypes = context.coordinator.getCachedWorkspaceTypes();
      if (workspaceTypes.length === 0) {
        workspaceTypes = await context.coordinator.resolver.resolveWorkspaceTypes('');
        context.coordinator.setCachedWorkspaceTypes(workspaceTypes);
      }
      rawTypes = workspaceTypes;
    } else if (config.inputSource === 'activeEditor') {
      rawTypes = context.coordinator.getCachedDocumentSymbols().filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'openEditors') {
      const openUris = context.coordinator.getOpenEditorUris();
      for (const uri of openUris) {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const symbols = await context.coordinator.resolver.resolveDocumentSymbols(doc);
          const types = context.coordinator.resolver.extractTypesOnly(symbols);
          rawTypes.push(...types);
        } catch {
          // ignore
        }
      }
    } else if (config.inputSource === 'previousPane') {
      const prev = context.upstreamOutput.symbols ?? context.upstreamOutput.items ?? [];
      const symbolTypes = prev.filter((s): s is FacetSymbolNode => {
        if (!s || typeof s !== 'object') {
          return false;
        }
        const candidate = s as Partial<FacetSymbolNode>;
        return candidate.kind !== undefined && isTypeKind(candidate.kind);
      });
      if (symbolTypes.length > 0) {
        rawTypes = symbolTypes;
      } else {
        const fileUris =
          context.upstreamOutput.uris && context.upstreamOutput.uris.length > 0
            ? context.upstreamOutput.uris
            : prev
                .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
                .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        if (fileUris.length > 0) {
          const seenUris = new Set<string>();
          for (const uri of fileUris) {
            if (seenUris.has(uri.fsPath)) {
              continue;
            }
            seenUris.add(uri.fsPath);
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              const symbols = await context.coordinator.resolver.resolveDocumentSymbols(doc);
              const types = context.coordinator.resolver.extractTypesOnly(symbols);
              rawTypes.push(...types);
            } catch {
              // ignore unopenable files
            }
          }
        }
      }
    }

    await context.coordinator.hydrateMissingSuperTypes(rawTypes);

    const knownMap = new Map<string, FacetSymbolNode>();
    for (const t of rawTypes) {
      knownMap.set(t.name, t);
    }
    for (const t of context.coordinator.getCachedWorkspaceTypes()) {
      if (!knownMap.has(t.name)) {
        knownMap.set(t.name, t);
      }
    }

    const currentClasses = this.determineCurrentClasses(context, rawTypes);

    if (!isTree) {
      // List view: show all super classes, the current class, and all subclasses
      const result: FacetSymbolNode[] = [];
      const seen = new Set<string>();

      for (const target of currentClasses) {
        const superClasses = await this.resolveSuperClasses(target, context, knownMap);
        for (const s of superClasses) {
          const key = `${s.name}::${s.uri?.toString() ?? ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push(s);
          }
        }
        const targetKey = `${target.name}::${target.uri?.toString() ?? ''}`;
        if (!seen.has(targetKey)) {
          seen.add(targetKey);
          result.push(target);
        }
        const subs = this.collectSubclassesRecursively([...superClasses, target], knownMap);
        for (const sub of subs) {
          const subKey = `${sub.name}::${sub.uri?.toString() ?? ''}`;
          if (!seen.has(subKey)) {
            seen.add(subKey);
            result.push(sub);
          }
        }
      }

      return result.filter((t) => matchesPaneFilters(t, filters));
    }

    // Tree view (default): show all super classes, subclasses of parents, and subclasses
    let allowedKinds: vscode.SymbolKind[] | undefined;
    if (subclassTypes && subclassTypes.length > 0) {
      const keyMap: Record<string, vscode.SymbolKind> = {
        class: vscode.SymbolKind.Class,
        interface: vscode.SymbolKind.Interface,
        struct: vscode.SymbolKind.Struct,
        enum: vscode.SymbolKind.Enum,
      };
      allowedKinds = subclassTypes.map((k) => keyMap[k]).filter((k): k is vscode.SymbolKind => k !== undefined);
    }

    const allTreeNodes: FacetSymbolNode[] = [];
    const seenTree = new Set<string>();

    const addTreeNode = (node: FacetSymbolNode) => {
      const key = `${node.name}::${node.uri?.toString() ?? ''}`;
      if (!seenTree.has(key)) {
        seenTree.add(key);
        allTreeNodes.push(node);
      }
    };

    for (const target of currentClasses) {
      const superClasses = await this.resolveSuperClasses(target, context, knownMap);
      for (const s of superClasses) {
        addTreeNode(s);
      }
      addTreeNode(target);

      const subs = this.collectSubclassesRecursively([...superClasses, target], knownMap);
      for (const sub of subs) {
        addTreeNode(sub);
      }
    }

    if (allTreeNodes.length === 0) {
      for (const r of rawTypes) {
        addTreeNode(r);
      }
    }

    const roots = buildTypeHierarchy(allTreeNodes, allowedKinds, filters);
    return sortSymbolNodes(roots, config.sort);
  }

  public getTreeItem(node: FacetSymbolNode, context: PaneExecutionContext<HierarchyPaneConfig>): vscode.TreeItem {
    const isTree = Boolean(context.config.tree);
    const filters = context.config.filters;
    const hasChildren =
      isTree && Boolean(node.subTypes?.some((c) => isTypeKind(c.kind) && matchesPaneFilters(c, filters)));

    const item = new vscode.TreeItem(
      node.name,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    item.resourceUri = node.uri;
    item.contextValue = 'facetSymbol';

    let desc = node.detail ?? '';
    if (node.isStatic) {
      desc = desc ? `static ${desc}` : 'static';
    }
    item.description = desc ? desc : undefined;
    item.iconPath = getSymbolIcon(node.kind);

    item.command = {
      command: 'facet.revealRange',
      title: 'Reveal in Editor',
      arguments: [node.uri, node.selectionRange ?? node.range],
    };

    return item;
  }

  public getParent(item: FacetSymbolNode): FacetSymbolNode | undefined {
    return item.parent;
  }

  public getOutput(items: readonly FacetSymbolNode[]): PaneOutput {
    return {
      symbols: Array.from(items),
      uris: items.map((s) => s.uri).filter((u): u is vscode.Uri => u instanceof vscode.Uri),
      items: Array.from(items),
    };
  }

  public async configureFilter(config: HierarchyPaneConfig): Promise<boolean> {
    const options = [
      { label: 'Symbol Kinds Filter...', action: 'kinds' },
      { label: 'Subclass Types (Class, Interface, Struct, Enum)...', action: 'subclasses' },
    ];
    const picked = await vscode.window.showQuickPick(options, {
      placeHolder: 'Configure Hierarchy Filters',
    });
    if (!picked) {
      return false;
    }

    if (picked.action === 'subclasses') {
      const current = config.subclassTypes ?? ['class', 'struct'];
      const subclassOptions = [
        { label: 'Class', key: 'class' as SymbolKindKey, picked: current.includes('class') },
        { label: 'Interface', key: 'interface' as SymbolKindKey, picked: current.includes('interface') },
        { label: 'Struct', key: 'struct' as SymbolKindKey, picked: current.includes('struct') },
        { label: 'Enum', key: 'enum' as SymbolKindKey, picked: current.includes('enum') },
      ];
      const selected = await vscode.window.showQuickPick(subclassOptions, {
        canPickMany: true,
        placeHolder: 'Select what types to show as subclasses',
      });
      if (selected) {
        config.subclassTypes = selected.map((s) => s.key);
        return true;
      }
      return false;
    }

    if (!config.filters) {
      config.filters = {};
    }
    const filterOptions = ALL_SYMBOL_FILTER_OPTIONS.map((opt) => ({
      label: opt.label,
      key: opt.key,
      picked: config.filters![opt.key] !== false,
    }));

    const selected = await vscode.window.showQuickPick(filterOptions, {
      canPickMany: true,
      placeHolder: 'Toggle symbol filters across 26 kinds (checked = visible)',
    });

    if (selected) {
      const selectedKeys = new Set(selected.map((s) => s.key));
      for (const opt of filterOptions) {
        config.filters[opt.key] = selectedKeys.has(opt.key);
      }
      return true;
    }
    return false;
  }

  private determineCurrentClasses(
    context: PaneExecutionContext<HierarchyPaneConfig>,
    rawTypes: FacetSymbolNode[],
  ): FacetSymbolNode[] {
    const config = context.config;

    if (config.inputSource === 'previousPane') {
      const prev =
        context.upstreamOutput.symbols && context.upstreamOutput.symbols.length > 0
          ? context.upstreamOutput.symbols
          : context.upstreamOutput.items && context.upstreamOutput.items.length > 0
            ? context.upstreamOutput.items
            : context.coordinator.getPreviousPaneSelection(config.id);

      const symbolTypes = prev.filter((s): s is FacetSymbolNode => {
        if (!s || typeof s !== 'object') {
          return false;
        }
        const candidate = s as Partial<FacetSymbolNode>;
        return candidate.kind !== undefined && isTypeKind(candidate.kind);
      });

      if (symbolTypes.length > 0) {
        return symbolTypes;
      }
    }

    const enclosing = context.coordinator.findEnclosingTypeAtCursor();
    if (enclosing) {
      const match = rawTypes.find((t) => t.name === enclosing.name);
      return [match ?? enclosing];
    }

    const slotSel = context.coordinator.getSlotSelection(config.id);
    const selTypes = slotSel.filter((s): s is FacetSymbolNode => {
      if (!s || typeof s !== 'object') {
        return false;
      }
      const candidate = s as Partial<FacetSymbolNode>;
      return candidate.kind !== undefined && isTypeKind(candidate.kind);
    });
    if (selTypes.length > 0) {
      return selTypes;
    }

    if (config.inputSource === 'activeEditor') {
      const docSymbols = context.coordinator.getCachedDocumentSymbols().filter((s) => isTypeKind(s.kind));
      if (docSymbols.length > 0) {
        return docSymbols;
      }
    }

    return rawTypes;
  }

  private async resolveSuperClasses(
    target: FacetSymbolNode,
    context: PaneExecutionContext<HierarchyPaneConfig>,
    knownMap: Map<string, FacetSymbolNode>,
  ): Promise<FacetSymbolNode[]> {
    const visited = new Set<string>();
    if (target.name) {
      visited.add(target.name);
    }

    const ancestors: FacetSymbolNode[] = [];
    const queue: FacetSymbolNode[] = [target];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.superTypes === undefined && current.uri) {
        await context.coordinator.hydrateMissingSuperTypes([current]);
      }

      let superNodes: FacetSymbolNode[] = [];
      if (current.uri && (!current.superTypes || current.superTypes.length === 0)) {
        superNodes = await context.coordinator.resolver.resolveTypeHierarchySupertypeNodes(
          current,
          context.cancellationToken,
        );
      }

      if (superNodes.length === 0 && current.superTypes && current.superTypes.length > 0) {
        for (const superName of current.superTypes) {
          if (visited.has(superName)) {
            continue;
          }
          let found = knownMap.get(superName);
          if (!found) {
            const cached = context.coordinator.getCachedWorkspaceTypes();
            found = cached.find((t) => t.name === superName);
          }
          if (!found) {
            const wsTypes = await context.coordinator.resolver.resolveWorkspaceTypes(
              superName,
              context.cancellationToken,
            );
            found = wsTypes.find((t) => t.name === superName);
          }
          if (!found && current.uri) {
            found = {
              name: superName,
              kind: vscode.SymbolKind.Class,
              uri: current.uri,
              range: new vscode.Range(0, 0, 0, 0),
              selectionRange: new vscode.Range(0, 0, 0, 0),
              category: MemberCategory.All,
              isStatic: false,
              children: [],
              superTypes: [],
            };
          }
          if (found) {
            superNodes.push(found);
          }
        }
      }

      for (const sup of superNodes) {
        if (!visited.has(sup.name)) {
          visited.add(sup.name);
          ancestors.push(sup);
          queue.push(sup);
        }
      }
    }

    ancestors.reverse();

    ancestors.sort((a, b) => {
      if (b.superTypes?.includes(a.name)) {
        return -1;
      }
      if (a.superTypes?.includes(b.name)) {
        return 1;
      }
      return 0;
    });

    return ancestors;
  }

  private findSubclasses(target: FacetSymbolNode, knownMap: Map<string, FacetSymbolNode>): FacetSymbolNode[] {
    const result: FacetSymbolNode[] = target.subTypes ? [...target.subTypes] : [];
    for (const node of knownMap.values()) {
      if (node.superTypes && node.superTypes.includes(target.name)) {
        if (!result.some((r) => r.name === node.name)) {
          result.push(node);
        }
      }
    }
    return result;
  }

  private collectSubclassesRecursively(
    targets: FacetSymbolNode[],
    knownMap: Map<string, FacetSymbolNode>,
    visited = new Set<string>(),
  ): FacetSymbolNode[] {
    const allSubs: FacetSymbolNode[] = [];
    for (const target of targets) {
      if (visited.has(target.name)) {
        continue;
      }
      visited.add(target.name);
      const direct = this.findSubclasses(target, knownMap);
      for (const d of direct) {
        allSubs.push(d);
      }
      if (direct.length > 0) {
        const deeper = this.collectSubclassesRecursively(direct, knownMap, visited);
        allSubs.push(...deeper);
      }
    }
    return allSubs;
  }
}
