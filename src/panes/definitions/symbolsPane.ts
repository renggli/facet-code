import * as vscode from 'vscode';
import {
  ALL_SYMBOL_FILTER_OPTIONS,
  createDefaultFilters,
  matchesPaneFilters,
  PaneInputSource,
  PaneRole,
  SortOption,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';
import {
  type FacetSymbolNode,
  getSymbolIcon,
  isTypeKind,
  sortSymbolNodes,
  unionMembers,
} from '../../models/symbolNode';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export class SymbolsPaneDefinition implements PaneDefinition<SymbolsPaneConfig, FacetSymbolNode> {
  public readonly role = PaneRole.Symbols;
  public readonly title = 'Symbols';
  public readonly icon = 'symbol-misc';
  public readonly description = 'Unified types and members navigator';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: [
      PaneInputSource.Project,
      PaneInputSource.OpenEditors,
      PaneInputSource.ActiveEditor,
      PaneInputSource.PreviousPane,
    ],
    supportedSorts: [SortOption.Position, SortOption.Name, SortOption.Category],
    hasTreeToggle: true,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): SymbolsPaneConfig {
    return {
      id: slotId,
      role: PaneRole.Symbols,
      title: 'Symbols',
      visible: true,
      inputSource: PaneInputSource.PreviousPane,
      sort: SortOption.Position,
      filters: createDefaultFilters(),
      tree: true,
    };
  }

  public async getChildren(
    context: PaneExecutionContext<SymbolsPaneConfig>,
    element?: FacetSymbolNode,
  ): Promise<FacetSymbolNode[]> {
    const config = context.config;
    const filters = config.filters;
    const isTree = Boolean(config.tree);

    // 1. Element provided: VS Code requesting children of an existing tree node
    if (element) {
      if (!isTree) {
        return [];
      }
      const node = element;

      if (isTypeKind(node.kind)) {
        if ((!node.children || node.children.length === 0) && node.uri) {
          try {
            const doc = await vscode.workspace.openTextDocument(node.uri);
            const symbols = await context.coordinator.resolver.resolveDocumentSymbols(doc);
            const match = symbols.find((s) => s.name === node.name && isTypeKind(s.kind));
            if (match?.children) {
              node.children = match.children;
              for (const child of node.children) {
                child.parent = node;
              }
            }
          } catch {
            // ignore
          }
        }
        let children = node.children ?? [];
        children = children.filter((c) => matchesPaneFilters(c, filters));
        return sortSymbolNodes(children, config.sort);
      }

      if (node.children && node.children.length > 0) {
        const children = node.children.filter((c) => matchesPaneFilters(c, filters));
        return sortSymbolNodes(children, config.sort);
      }

      return [];
    }

    // 2. Root level
    let targetTypes: FacetSymbolNode[] = [];
    let isTypeInput = false;

    if (config.inputSource === PaneInputSource.PreviousPane) {
      const prevSel =
        context.upstreamOutput.symbols && context.upstreamOutput.symbols.length > 0
          ? context.upstreamOutput.symbols
          : context.upstreamOutput.items && context.upstreamOutput.items.length > 0
            ? context.upstreamOutput.items
            : context.coordinator.getPreviousPaneSelection(config.id);

      const symbolTypes = prevSel.filter((s): s is FacetSymbolNode => {
        if (!s || typeof s !== 'object') {
          return false;
        }
        const candidate = s as Partial<FacetSymbolNode>;
        return (
          candidate.kind !== undefined && (isTypeKind(candidate.kind) || candidate.kind === vscode.SymbolKind.Function)
        );
      });

      if (symbolTypes.length > 0) {
        targetTypes = symbolTypes;
        isTypeInput = true;
      } else {
        const fileUris =
          context.upstreamOutput.uris && context.upstreamOutput.uris.length > 0
            ? context.upstreamOutput.uris
            : prevSel
                .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
                .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        if (fileUris.length > 0) {
          isTypeInput = false;
          targetTypes = await this.resolveTypesFromFiles(fileUris, context);
        } else {
          const prevPane = context.coordinator.getPreviousPane(config.id);
          if (prevPane) {
            const prevChildren = await context.coordinator.getSlotChildren(prevPane);
            const prevTypes = prevChildren.filter((s): s is FacetSymbolNode => {
              if (!s || typeof s !== 'object') {
                return false;
              }
              const candidate = s as Partial<FacetSymbolNode>;
              return (
                candidate.kind !== undefined &&
                (isTypeKind(candidate.kind) || candidate.kind === vscode.SymbolKind.Function)
              );
            });
            if (prevTypes.length > 0) {
              targetTypes = [prevTypes[0]];
              isTypeInput = true;
            } else {
              const prevUris = prevChildren
                .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
                .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
              if (prevUris.length > 0) {
                targetTypes = await this.resolveTypesFromFiles(prevUris, context);
                isTypeInput = false;
              }
            }
          }
        }
      }
    } else if (config.inputSource === PaneInputSource.ActiveEditor) {
      const activeUri =
        config.pinned && config.pinnedUri
          ? vscode.Uri.parse(config.pinnedUri)
          : (context.activeEditor?.document.uri ?? vscode.window.activeTextEditor?.document.uri);
      if (activeUri) {
        targetTypes = await this.resolveTypesFromFiles([activeUri], context);
      }
      isTypeInput = false;
    } else if (config.inputSource === PaneInputSource.OpenEditors) {
      const openUris = context.coordinator.getOpenEditorUris();
      targetTypes = await this.resolveTypesFromFiles(openUris, context);
      isTypeInput = false;
    } else if (config.inputSource === PaneInputSource.Project) {
      let workspaceTypes = context.coordinator.getCachedWorkspaceTypes();
      if (workspaceTypes.length === 0) {
        workspaceTypes = await context.coordinator.resolver.resolveWorkspaceTypes('');
        context.coordinator.setCachedWorkspaceTypes(workspaceTypes);
      }
      targetTypes = workspaceTypes;
      isTypeInput = false;
    }

    if (isTypeInput) {
      for (const t of targetTypes) {
        if ((!t.children || t.children.length === 0) && t.uri) {
          try {
            const doc = await vscode.workspace.openTextDocument(t.uri);
            const symbols = await context.coordinator.resolver.resolveDocumentSymbols(doc);
            const match = symbols.find((s) => s.name === t.name && isTypeKind(s.kind));
            if (match?.children) {
              t.children = match.children;
              for (const child of t.children) {
                child.parent = t;
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const rawMembers = unionMembers(targetTypes);
      const filtered = rawMembers.filter((m) => matchesPaneFilters(m, filters));
      return sortSymbolNodes(filtered, config.sort);
    }

    await context.coordinator.hydrateMissingSuperTypes(targetTypes);
    const filtered = targetTypes.filter((t) => matchesPaneFilters(t, filters));
    return sortSymbolNodes(filtered, config.sort);
  }

  public getTreeItem(node: FacetSymbolNode, context: PaneExecutionContext<SymbolsPaneConfig>): vscode.TreeItem {
    let hasChildren = false;
    const isTree = Boolean(context.config.tree);

    if (isTree) {
      if (isTypeKind(node.kind)) {
        const filters = context.config.filters;
        if (node.children && node.children.length > 0) {
          hasChildren = node.children.some((c) => matchesPaneFilters(c, filters));
        } else {
          hasChildren = true;
        }
      } else {
        const filters = context.config.filters;
        hasChildren = Boolean(node.children?.some((c) => matchesPaneFilters(c, filters)));
      }
    }

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

  public async configureFilter(config: SymbolsPaneConfig): Promise<boolean> {
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

  // --- Private Helpers at Bottom ---

  private async resolveTypesFromFiles(
    fileUris: vscode.Uri[],
    context: PaneExecutionContext<SymbolsPaneConfig>,
  ): Promise<FacetSymbolNode[]> {
    const rawTypes: FacetSymbolNode[] = [];
    const seenUris = new Set<string>();

    for (const uri of fileUris) {
      if (seenUris.has(uri.fsPath)) {
        continue;
      }
      seenUris.add(uri.fsPath);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const symbols = await context.coordinator.resolver.resolveDocumentSymbols(doc);
        const types = symbols.filter((s) => isTypeKind(s.kind) || s.kind === vscode.SymbolKind.Function);
        rawTypes.push(...(types.length > 0 ? types : symbols));
      } catch {
        // ignore unopenable files
      }
    }
    return rawTypes;
  }
}
