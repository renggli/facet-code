import * as vscode from 'vscode';
import { SymbolResolver } from '../services/symbolResolver';
import { TypesTreeProvider, TypesScope } from '../providers/typesTreeProvider';
import { MembersTreeProvider } from '../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../providers/relationsTreeProvider';
import {
  FacetSymbolNode,
  HierarchyMode,
  LayoutMode,
  isTypeKind,
  unionMembers,
  getSymbolIcon
} from '../models/symbolNode';
import { PaneConfig, matchesPaneFilters } from '../models/paneConfig';
import { PanePipelineManager } from './panePipelineManager';

export class FacetCoordinator implements vscode.Disposable {
  private cancellationSource?: vscode.CancellationTokenSource;
  private debounceTimer?: NodeJS.Timeout;
  private currentEditor?: vscode.TextEditor;

  public scope: TypesScope = 'file';
  public hierarchyMode: HierarchyMode = 'flat';
  public layoutMode: LayoutMode = 'list';

  private cachedWorkspaceTypes: FacetSymbolNode[] = [];
  private cachedDocumentSymbols: FacetSymbolNode[] = [];
  private slotSelections = new Map<string, readonly any[]>();
  private pipelineManager?: PanePipelineManager;

  private _onDidRefreshSlot = new vscode.EventEmitter<string>();
  readonly onDidRefreshSlot = this._onDidRefreshSlot.event;

  private _onDidRefreshAll = new vscode.EventEmitter<void>();
  readonly onDidRefreshAll = this._onDidRefreshAll.event;

  private _onRevealInView = new vscode.EventEmitter<{ slotId: string; node: any }>();
  readonly onRevealInView = this._onRevealInView.event;

  constructor(
    public readonly resolver: SymbolResolver,
    public readonly typesProvider: TypesTreeProvider,
    public readonly membersProvider: MembersTreeProvider,
    public readonly relationsProvider: RelationsTreeProvider
  ) {
    this.typesProvider.scope = this.scope;
    this.membersProvider.setLayoutMode(this.layoutMode);
  }

  public setPipelineManager(pm: PanePipelineManager): void {
    this.pipelineManager = pm;
  }

  public getPipelineManager(): PanePipelineManager | undefined {
    return this.pipelineManager;
  }

  public getSlotSelection(slotId: string): readonly any[] {
    return this.slotSelections.get(slotId) || [];
  }

  public setSlotSelection(slotId: string, selection: readonly any[]): void {
    this.slotSelections.set(slotId, selection);
  }

  public refreshSlot(slotId: string): void {
    this._onDidRefreshSlot.fire(slotId);
  }

  public refreshAll(): void {
    this._onDidRefreshAll.fire();
  }

  public handleEditorChange(editor: vscode.TextEditor | undefined): void {
    this.currentEditor = editor;
    this.scheduleSync();
  }

  public handleSelectionChange(editor: vscode.TextEditor): void {
    this.currentEditor = editor;

    // Follow cursor in panes that have followCursor enabled
    if (this.pipelineManager) {
      for (const pane of this.pipelineManager.getVisiblePanes()) {
        if (!pane.followCursor) {
          continue;
        }

        if (pane.role === 'types') {
          const typeNode = this.findEnclosingTypeAtCursor();
          if (typeNode) {
            this._onRevealInView.fire({ slotId: pane.id, node: typeNode });
          }
        } else if (pane.role === 'members') {
          const memberNode = this.findMemberAtCursor();
          if (memberNode) {
            this._onRevealInView.fire({ slotId: pane.id, node: memberNode });
          }
        }
      }
    }

    if (this.scope === 'file') {
      this.scheduleSync();
    }
  }

  public scheduleSync(delayMs = 150): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
      this.cancellationSource = undefined;
    }

    this.debounceTimer = setTimeout(() => {
      void this.sync();
    }, delayMs);
  }

  public async sync(): Promise<void> {
    this.cancellationSource = new vscode.CancellationTokenSource();
    const token = this.cancellationSource.token;

    try {
      // 1. Resolve workspace types for project-scoped queries
      this.cachedWorkspaceTypes = await this.resolver.resolveWorkspaceTypes('', token);
      if (token.isCancellationRequested) {
        return;
      }

      // 2. Resolve current editor document symbols if editor is active
      if (this.currentEditor) {
        this.cachedDocumentSymbols = await this.resolver.resolveDocumentSymbols(
          this.currentEditor.document,
          token
        );
        if (token.isCancellationRequested) {
          return;
        }
      } else {
        this.cachedDocumentSymbols = [];
      }

      // Sync legacy providers for backwards compatibility
      if (this.scope === 'project') {
        this.typesProvider.setTypes(this.cachedWorkspaceTypes);
      } else {
        this.typesProvider.setSymbols(this.cachedDocumentSymbols);
      }

      this.refreshAll();
    } catch (err) {
      if (!token.isCancellationRequested) {
        console.error('Facet sync error:', err);
      }
    }
  }

  public async handleSlotSelection(slotId: string, selection: readonly any[]): Promise<void> {
    this.slotSelections.set(slotId, selection);

    const pane = this.pipelineManager?.getPane(slotId);
    if (pane && pane.navigateOnSelect && selection.length > 0) {
      const first = selection[0];
      if (first.uri && (first.selectionRange || first.range)) {
        await vscode.commands.executeCommand(
          'facet.revealRange',
          first.uri,
          first.selectionRange || first.range
        );
      }
    }

    // Refresh downstream panes whose input is 'previous'
    if (this.pipelineManager) {
      const visible = this.pipelineManager.getVisiblePanes();
      const idx = visible.findIndex((p) => p.id === slotId);
      if (idx !== -1) {
        for (let i = idx + 1; i < visible.length; i++) {
          if (visible[i].inputSource === 'previous') {
            this.refreshSlot(visible[i].id);
          }
        }
      }
    }
  }

  public getPreviousPane(slotId: string): PaneConfig | undefined {
    if (!this.pipelineManager) {
      return undefined;
    }
    const visible = this.pipelineManager.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    return idx > 0 ? visible[idx - 1] : undefined;
  }

  public getPreviousPaneSelection(slotId: string): readonly any[] {
    const prev = this.getPreviousPane(slotId);
    return prev ? this.getSlotSelection(prev.id) : [];
  }

  public async getSlotChildren(config: PaneConfig, element?: any): Promise<any[]> {
    switch (config.role) {
      case 'types':
        return this.getTypeChildren(config, element);
      case 'members':
        return this.getMemberChildren(config, element);
      case 'references':
        return this.getRelationChildren(config, 'references');
      case 'implementations':
        return this.getRelationChildren(config, 'implementations');
      case 'callers':
        return this.getRelationChildren(config, 'callers');
      case 'hierarchy':
        return this.getTypeChildren(config, element);
      default:
        return [];
    }
  }

  private async getTypeChildren(config: PaneConfig, element?: any): Promise<any[]> {
    if (element) {
      if (config.display === 'hierarchy' && element.children) {
        return (element.children as FacetSymbolNode[]).filter(
          (c) => isTypeKind(c.kind) && matchesPaneFilters(c, config.filters)
        );
      }
      return [];
    }

    let rawTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'project') {
      if (this.cachedWorkspaceTypes.length === 0) {
        this.cachedWorkspaceTypes = await this.resolver.resolveWorkspaceTypes('');
      }
      rawTypes = this.cachedWorkspaceTypes;
    } else if (config.inputSource === 'file') {
      rawTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'cursor') {
      const curType = this.findEnclosingTypeAtCursor();
      rawTypes = curType ? [curType] : [];
    } else if (config.inputSource === 'previous') {
      const prev = this.getPreviousPaneSelection(config.id);
      rawTypes = prev.filter((s) => isTypeKind(s.kind));
    }

    const filtered = rawTypes.filter((t) => matchesPaneFilters(t, config.filters));

    if (config.display === 'flat') {
      return filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }

  private async getMemberChildren(config: PaneConfig, element?: any): Promise<any[]> {
    if (element) {
      if (config.display === 'hierarchy' && element.children) {
        return (element.children as FacetSymbolNode[]).filter((c) =>
          matchesPaneFilters(c, config.filters)
        );
      }
      return [];
    }

    let targetTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'previous') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      targetTypes = prevSel.filter((s) => isTypeKind(s.kind));

      if (targetTypes.length === 0) {
        const prevPane = this.getPreviousPane(config.id);
        if (prevPane) {
          const prevChildren = await this.getSlotChildren(prevPane);
          if (prevChildren.length > 0 && isTypeKind(prevChildren[0].kind)) {
            targetTypes = [prevChildren[0]];
          }
        }
      }
    } else if (config.inputSource === 'cursor') {
      const curType = this.findEnclosingTypeAtCursor();
      targetTypes = curType ? [curType] : [];
    } else if (config.inputSource === 'file') {
      targetTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'project') {
      targetTypes = this.cachedWorkspaceTypes;
    }

    // Lazy hydration for workspace types with unpopulated children
    for (const t of targetTypes) {
      if ((!t.children || t.children.length === 0) && t.uri) {
        try {
          const doc = await vscode.workspace.openTextDocument(t.uri);
          const symbols = await this.resolver.resolveDocumentSymbols(doc);
          const match = symbols.find((s) => s.name === t.name && isTypeKind(s.kind));
          if (match && match.children) {
            t.children = match.children;
          }
        } catch {
          // ignore
        }
      }
    }

    const rawMembers = unionMembers(targetTypes);
    const filtered = rawMembers.filter((m) => matchesPaneFilters(m, config.filters));

    if (config.display === 'flat') {
      return filtered.slice().sort((a, b) => a.name.localeCompare(b.name));
    }

    return filtered;
  }

  private async getRelationChildren(
    config: PaneConfig,
    mode: 'references' | 'callers' | 'implementations'
  ): Promise<any[]> {
    let targets: FacetSymbolNode[] = [];

    if (config.inputSource === 'cursor') {
      const member = this.findMemberAtCursor() || this.findEnclosingTypeAtCursor();
      targets = member ? [member] : [];
    } else {
      const prevSel = this.getPreviousPaneSelection(config.id);
      targets = prevSel.filter((s) => s && s.name && s.uri);

      if (targets.length === 0) {
        const prevPane = this.getPreviousPane(config.id);
        if (prevPane) {
          const prevItems = await this.getSlotChildren(prevPane);
          if (prevItems.length > 0 && prevItems[0].uri) {
            targets = [prevItems[0]];
          }
        }
      }
    }

    if (targets.length === 0) {
      return [];
    }

    return this.relationsProvider.fetchRelationsForNodes(targets, mode);
  }

  public getSlotTreeItem(config: PaneConfig, element: any): vscode.TreeItem {
    if (element && 'uri' in element && 'range' in element && 'label' in element && !('kind' in element)) {
      const item = this.relationsProvider.getTreeItem(element);
      if (!config.navigateOnSelect) {
        item.command = undefined;
      }
      return item;
    }

    const node = element as FacetSymbolNode;
    const hasChildren =
      config.display === 'hierarchy' && node.children && node.children.length > 0;

    const item = new vscode.TreeItem(
      node.name,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    let desc = node.detail || '';
    if (node.isStatic) {
      desc = desc ? `static ${desc}` : 'static';
    }
    item.description = desc;
    item.iconPath = getSymbolIcon(node.kind);

    if (config.navigateOnSelect) {
      item.command = {
        command: 'facet.revealRange',
        title: 'Reveal in Editor',
        arguments: [node.uri, node.selectionRange || node.range]
      };
    }

    return item;
  }

  public findEnclosingTypeAtCursor(): FacetSymbolNode | undefined {
    if (!this.currentEditor) {
      return undefined;
    }
    const pos = this.currentEditor.selection.active;
    return this.cachedDocumentSymbols.find(
      (s) => isTypeKind(s.kind) && s.range.contains(pos)
    );
  }

  public findMemberAtCursor(): FacetSymbolNode | undefined {
    const parentType = this.findEnclosingTypeAtCursor();
    if (!parentType || !this.currentEditor) {
      return undefined;
    }
    const pos = this.currentEditor.selection.active;
    return parentType.children.find((c) => c.range.contains(pos));
  }

  public async selectTypes(types: readonly FacetSymbolNode[]): Promise<void> {
    this.membersProvider.setSelectedTypes(types);
    const members = this.membersProvider.getFilteredMembers();
    if (members.length > 0) {
      this.selectMembers([members[0]]);
    } else {
      this.selectMembers([]);
    }
  }

  public selectMembers(members: readonly FacetSymbolNode[]): void {
    this.relationsProvider.setSelectedMembers(members);
  }

  public async toggleScope(): Promise<TypesScope> {
    this.scope = this.scope === 'file' ? 'project' : 'file';
    this.typesProvider.scope = this.scope;
    await this.sync();
    return this.scope;
  }

  public toggleHierarchy(): HierarchyMode {
    this.hierarchyMode = this.hierarchyMode === 'flat' ? 'inherited' : 'flat';
    return this.hierarchyMode;
  }

  public toggleLayout(): LayoutMode {
    this.layoutMode = this.layoutMode === 'list' ? 'tree' : 'list';
    this.membersProvider.setLayoutMode(this.layoutMode);
    return this.layoutMode;
  }

  public setRelationsMode(mode: 'references' | 'callers' | 'implementations'): void {
    this.relationsProvider.setMode(mode);
  }

  public async revealRange(uri: vscode.Uri, range: vscode.Range): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.end);
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
    }
    this._onDidRefreshSlot.dispose?.();
    this._onDidRefreshAll.dispose?.();
    this._onRevealInView.dispose?.();
  }
}
