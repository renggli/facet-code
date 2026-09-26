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
  getSymbolIcon,
  extractSuperTypes,
  extractTypeHeader,
  buildTypeHierarchy
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
  private cachedWorkspaceFiles: vscode.Uri[] = [];
  private cachedDocumentSymbols: FacetSymbolNode[] = [];
  private cachedDocumentUri?: string;
  private isInternalSelection = false;
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

  public async handleSelectionChange(editor: vscode.TextEditor): Promise<void> {
    if (this.isInternalSelection) {
      return;
    }
    this.currentEditor = editor;

    if (
      !this.cachedDocumentSymbols ||
      this.cachedDocumentSymbols.length === 0 ||
      this.cachedDocumentUri !== editor.document.uri.toString()
    ) {
      try {
        this.cachedDocumentSymbols = await this.resolver.resolveDocumentSymbols(editor.document);
        this.cachedDocumentUri = editor.document.uri.toString();
      } catch {
        // ignore
      }
    }

    if (!this.pipelineManager) {
      return;
    }

    const visible = this.pipelineManager.getVisiblePanes();
    const hasCursorPane = visible.some((p) => p.selectionSource === 'cursor');
    if (!hasCursorPane) {
      return;
    }

    let lastCursorIdx = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].selectionSource === 'cursor') {
        lastCursorIdx = i;
        break;
      }
    }

    const enclosingType = this.findEnclosingTypeAtCursor();
    const memberAtCursor = this.findMemberAtCursor();
    const docUri = this.currentEditor.document.uri;

    for (let i = 0; i <= lastCursorIdx; i++) {
      const pane = visible[i];
      const shouldUpdate = pane.selectionSource === 'cursor' || i < lastCursorIdx;
      if (!shouldUpdate) {
        continue;
      }

      let rawTarget: any | undefined;
      if (pane.role === 'files') {
        rawTarget = docUri;
      } else if (pane.role === 'types' || pane.role === 'hierarchy') {
        rawTarget = enclosingType;
      } else if (pane.role === 'members') {
        rawTarget = memberAtCursor;
      }

      if (!rawTarget) {
        continue;
      }

      const matchingItem = await this.findMatchingSlotItem(pane, rawTarget);
      const itemToSet = matchingItem || rawTarget;
      this.setSlotSelection(pane.id, [itemToSet]);
      this._onRevealInView.fire({ slotId: pane.id, node: itemToSet });

      if (i + 1 < visible.length && visible[i + 1].inputSource === 'pane') {
        this.refreshSlot(visible[i + 1].id);
      }
    }

    if (this.scope === 'file') {
      this.scheduleSync();
    }
  }

  public async findMatchingSlotItem(pane: PaneConfig, target: any): Promise<any | undefined> {
    if (!target) {
      return undefined;
    }
    if (target instanceof vscode.Uri) {
      const items = await this.getSlotChildren(pane);
      return items.find((item) => item instanceof vscode.Uri && item.fsPath === target.fsPath);
    }
    if (pane.role === 'types' || pane.role === 'hierarchy') {
      const items = await this.getSlotChildren(pane);
      const search = (list: FacetSymbolNode[]): FacetSymbolNode | undefined => {
        for (const item of list) {
          if (item.name === target.name && (item.uri?.fsPath === target.uri?.fsPath || !target.uri)) {
            return item;
          }
          if (item.subTypes && item.subTypes.length > 0) {
            const found = search(item.subTypes);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      };
      return search(items);
    }
    if (pane.role === 'members') {
      const items = await this.getSlotChildren(pane);
      return items.find(
        (item: FacetSymbolNode) =>
          item.name === target.name &&
          item.kind === target.kind &&
          (item.range?.start?.line === target.range?.start?.line || !item.range)
      );
    }
    return target;
  }

  public handlePaneSelectionSourceChange(slotId: string): void {
    const pane = this.pipelineManager?.getPane(slotId);
    if (!pane) {
      return;
    }

    if (pane.selectionSource === 'cursor') {
      if (this.currentEditor) {
        this.handleSelectionChange(this.currentEditor);
      }
    } else if (pane.selectionSource === 'all') {
      void (async () => {
        const items = await this.getSlotChildren(pane);
        this.setSlotSelection(slotId, items);
        this.refreshSlot(slotId);
        // Refresh downstream panes whose input is 'pane'
        if (this.pipelineManager) {
          const visible = this.pipelineManager.getVisiblePanes();
          const idx = visible.findIndex((p) => p.id === slotId);
          if (idx !== -1) {
            for (let i = idx + 1; i < visible.length; i++) {
              if (visible[i].inputSource === 'pane') {
                this.refreshSlot(visible[i].id);
              }
            }
          }
        }
      })();
    } else {
      // none
      this.refreshSlot(slotId);
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
      // 1. Resolve workspace types for global-scoped queries
      this.cachedWorkspaceTypes = await this.resolver.resolveWorkspaceTypes('', token);
      if (token.isCancellationRequested) {
        return;
      }

      // 2. Discover workspace files
      try {
        this.cachedWorkspaceFiles = await vscode.workspace.findFiles(
          '**/*',
          '**/{node_modules,.git,dist,out,build}/**'
        );
      } catch {
        this.cachedWorkspaceFiles = [];
      }
      if (token.isCancellationRequested) {
        return;
      }

      // 3. Resolve current editor document symbols if editor is active
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
      if (this.currentEditor) {
        void this.handleSelectionChange(this.currentEditor);
      }
    } catch (err) {
      if (!token.isCancellationRequested) {
        console.error('Facet sync error:', err);
      }
    }
  }

  public async handleSlotSelection(slotId: string, selection: readonly any[]): Promise<void> {
    this.isInternalSelection = true;
    try {
      this.slotSelections.set(slotId, selection);

      if (selection.length === 1) {
        const first = selection[0];
        if (first instanceof vscode.Uri) {
          await vscode.commands.executeCommand('vscode.open', first);
        } else if (first.uri && (first.selectionRange || first.range)) {
          await vscode.commands.executeCommand(
            'facet.revealRange',
            first.uri,
            first.selectionRange || first.range
          );
        }
      }

      // Refresh downstream panes whose input is 'pane'
      if (this.pipelineManager) {
        const visible = this.pipelineManager.getVisiblePanes();
        const idx = visible.findIndex((p) => p.id === slotId);
        if (idx !== -1) {
          for (let i = idx + 1; i < visible.length; i++) {
            if (visible[i].inputSource === 'pane') {
              this.refreshSlot(visible[i].id);
              if (visible[i].selectionSource === 'all') {
                this.handlePaneSelectionSourceChange(visible[i].id);
              }
            }
          }
        }
      }
    } finally {
      this.isInternalSelection = false;
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
      case 'files':
        return this.getFileChildren(config);
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

  public getSlotParent(config: PaneConfig, element: any): any | undefined {
    if (element && typeof element === 'object' && 'parent' in element) {
      return element.parent;
    }
    return undefined;
  }

  private async getFileChildren(config: PaneConfig): Promise<vscode.Uri[]> {
    let files: vscode.Uri[] = [];

    if (config.inputSource === 'global') {
      if (this.cachedWorkspaceFiles.length === 0) {
        try {
          this.cachedWorkspaceFiles = await vscode.workspace.findFiles(
            '**/*',
            '**/{node_modules,.git,dist,out,build}/**'
          );
        } catch {
          this.cachedWorkspaceFiles = [];
        }
      }
      files = [...this.cachedWorkspaceFiles];
    } else if (config.inputSource === 'file') {
      if (this.currentEditor?.document.uri) {
        files = [this.currentEditor.document.uri];
      }
    } else if (config.inputSource === 'pane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      files = prevSel
        .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
        .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
    }

    if (config.filePattern && config.filePattern.trim()) {
      try {
        const regex = new RegExp(config.filePattern.trim(), 'i');
        files = files.filter((u) => {
          const relPath = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(u) : u.fsPath;
          const fileName = u.path.split('/').pop() || '';
          return regex.test(relPath) || regex.test(fileName);
        });
      } catch {
        // Fallback: substring match if invalid regexp
        const pat = config.filePattern.trim().toLowerCase();
        files = files.filter((u) => {
          const relPath = (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(u) : u.fsPath).toLowerCase();
          return relPath.includes(pat);
        });
      }
    }

    // Sort files
    if (config.sort === 'alphabetical') {
      files.sort((a, b) => {
        const nameA = a.path.split('/').pop() || '';
        const nameB = b.path.split('/').pop() || '';
        return nameA.localeCompare(nameB);
      });
    } else {
      files.sort((a, b) => {
        const pathA = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(a) : a.fsPath;
        const pathB = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(b) : b.fsPath;
        return pathA.localeCompare(pathB);
      });
    }

    return files;
  }

  private sortItems<T extends FacetSymbolNode>(items: T[], sort: PaneConfig['sort']): T[] {
    const copy = items.slice();
    if (sort === 'alphabetical') {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sort === 'fileOrder') {
      return copy.sort((a, b) => {
        const lineDiff = (a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0);
        if (lineDiff !== 0) {
          return lineDiff;
        }
        return (a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0);
      });
    }
    if (sort === 'grouped') {
      return copy.sort((a, b) => {
        const kindDiff = a.kind - b.kind;
        if (kindDiff !== 0) {
          return kindDiff;
        }
        return a.name.localeCompare(b.name);
      });
    }
    return copy;
  }

  private async getTypeChildren(config: PaneConfig, element?: any): Promise<any[]> {
    if (element) {
      if (config.display === 'hierarchy') {
        const node = element as FacetSymbolNode;
        const subTypes = node.subTypes || [];
        const filtered = subTypes.filter(
          (c) => isTypeKind(c.kind) && matchesPaneFilters(c, config.filters)
        );
        return this.sortItems(filtered, config.sort);
      }
      return [];
    }

    let rawTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'global') {
      if (this.cachedWorkspaceTypes.length === 0) {
        this.cachedWorkspaceTypes = await this.resolver.resolveWorkspaceTypes('');
      }
      rawTypes = this.cachedWorkspaceTypes;
    } else if (config.inputSource === 'file') {
      rawTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'pane') {
      const prev = this.getPreviousPaneSelection(config.id);
      const symbolTypes = prev.filter((s) => s && isTypeKind(s.kind));
      if (symbolTypes.length > 0) {
        rawTypes = symbolTypes;
      } else {
        // Check if previous pane selection contains file URIs
        const fileUris = prev
          .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
          .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        if (fileUris.length > 0) {
          for (const uri of fileUris) {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              const symbols = await this.resolver.resolveDocumentSymbols(doc);
              const types = this.resolver.extractTypesOnly(symbols);
              rawTypes.push(...types);
            } catch {
              // ignore unopenable files
            }
          }
        }
      }
    }

    // Hydrate superTypes if missing across open tabs and disk files
    await this.hydrateMissingSuperTypes(rawTypes);

    const filtered = rawTypes.filter((t) => matchesPaneFilters(t, config.filters));

    if (config.display === 'hierarchy') {
      let allowedKinds: vscode.SymbolKind[] | undefined;
      if (config.subclassTypes && config.subclassTypes.length > 0) {
        const keyMap: Record<string, vscode.SymbolKind> = {
          class: vscode.SymbolKind.Class,
          interface: vscode.SymbolKind.Interface,
          struct: vscode.SymbolKind.Struct,
          enum: vscode.SymbolKind.Enum
        };
        allowedKinds = config.subclassTypes.map((k) => keyMap[k]).filter((k) => k !== undefined);
      }
      const roots = buildTypeHierarchy(filtered, allowedKinds);
      return this.sortItems(roots, config.sort);
    }

    return this.sortItems(filtered, config.sort);
  }

  private async getMemberChildren(config: PaneConfig, element?: any): Promise<any[]> {
    if (element) {
      if (config.display === 'hierarchy' && element.children) {
        const children = (element.children as FacetSymbolNode[]).filter((c) =>
          matchesPaneFilters(c, config.filters)
        );
        return this.sortItems(children, config.sort);
      }
      return [];
    }

    let targetTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'pane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      targetTypes = prevSel.filter((s) => isTypeKind(s.kind));

      if (targetTypes.length === 0) {
        // Check if previous pane selection contains file URIs
        const fileUris = prevSel
          .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
          .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        if (fileUris.length > 0) {
          for (const uri of fileUris) {
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              const symbols = await this.resolver.resolveDocumentSymbols(doc);
              const types = this.resolver.extractTypesOnly(symbols);
              targetTypes.push(...types);
            } catch {
              // ignore
            }
          }
        }
      }

      if (targetTypes.length === 0) {
        const prevPane = this.getPreviousPane(config.id);
        if (prevPane) {
          const prevChildren = await this.getSlotChildren(prevPane);
          if (prevChildren.length > 0 && isTypeKind(prevChildren[0].kind)) {
            targetTypes = [prevChildren[0]];
          }
        }
      }
    } else if (config.inputSource === 'file') {
      targetTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'global') {
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

    return this.sortItems(filtered, config.sort);
  }

  private async getRelationChildren(
    config: PaneConfig,
    mode: 'references' | 'callers' | 'implementations'
  ): Promise<any[]> {
    let targets: FacetSymbolNode[] = [];

    if (config.inputSource === 'file') {
      const cur = this.findMemberAtCursor() || this.findEnclosingTypeAtCursor();
      targets = cur ? [cur] : [];
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

  private async hydrateMissingSuperTypes(types: FacetSymbolNode[]): Promise<void> {
    const missing = types.filter((t) => t.superTypes === undefined && t.uri);
    if (missing.length === 0) {
      return;
    }

    const byUri = new Map<string, FacetSymbolNode[]>();
    for (const t of missing) {
      const uriStr = t.uri.toString();
      const list = byUri.get(uriStr) || [];
      list.push(t);
      byUri.set(uriStr, list);
    }

    for (const [uriStr, typeGroup] of byUri.entries()) {
      let lines: string[] | undefined;
      const openDoc = (vscode.workspace.textDocuments || []).find(
        (d) => d.uri.toString() === uriStr
      );
      if (openDoc) {
        lines = openDoc.getText().split('\n');
      } else {
        try {
          if (vscode.workspace.fs?.readFile) {
            const bytes = await vscode.workspace.fs.readFile(typeGroup[0].uri);
            lines = Buffer.from(bytes).toString('utf8').split('\n');
          } else if (vscode.workspace.openTextDocument) {
            const doc = await vscode.workspace.openTextDocument(typeGroup[0].uri);
            lines = doc.getText().split('\n');
          }
        } catch {
          lines = undefined;
        }
      }

      for (const t of typeGroup) {
        if (lines && t.range && t.range.start.line < lines.length) {
          const isInterface = t.kind === vscode.SymbolKind.Interface;
          const header = extractTypeHeader(lines, t.range.start.line);
          t.superTypes = extractSuperTypes(header, isInterface);
        } else {
          t.superTypes = [];
        }
      }
    }
  }

  public getSlotTreeItem(config: PaneConfig, element: any): vscode.TreeItem {
    if (element instanceof vscode.Uri) {
      const fileName = element.path?.split('/').pop() || element.fsPath || 'file';
      let relPath = '';
      try {
        relPath = (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(element) : element.fsPath) || '';
      } catch {
        relPath = element.fsPath || element.path || '';
      }
      const item = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
      if (relPath) {
        const lastSlash = relPath.lastIndexOf('/');
        item.description = lastSlash !== -1 ? relPath.slice(0, lastSlash) : undefined;
      }
      item.iconPath = vscode.ThemeIcon.File;
      item.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [element]
      };
      return item;
    }

    if (element && 'uri' in element && 'range' in element && 'label' in element && !('kind' in element)) {
      return this.relationsProvider.getTreeItem(element);
    }

    const node = element as FacetSymbolNode;
    const isTypeRole = config.role === 'types' || config.role === 'hierarchy';
    let hasChildren = false;

    if (config.display === 'hierarchy') {
      if (isTypeRole) {
        hasChildren = Boolean(
          node.subTypes &&
            node.subTypes.some((c) => isTypeKind(c.kind) && matchesPaneFilters(c, config.filters))
        );
      } else {
        hasChildren = Boolean(node.children && node.children.length > 0);
      }
    }

    const item = new vscode.TreeItem(
      node.name,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    let desc = node.detail || '';
    if (node.isStatic) {
      desc = desc ? `static ${desc}` : 'static';
    }
    item.description = desc || undefined;
    item.iconPath = getSymbolIcon(node.kind);

    item.command = {
      command: 'facet.revealRange',
      title: 'Reveal in Editor',
      arguments: [node.uri, node.selectionRange || node.range]
    };

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
