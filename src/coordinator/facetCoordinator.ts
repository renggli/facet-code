import * as vscode from 'vscode';
import type { PaneConfig } from '../models/paneConfig';
import { extractSuperTypes, extractTypeHeader, type FacetSymbolNode, isTypeKind } from '../models/symbolNode';
import type { DirectoryNode } from '../panes/definitions/directoriesPane';
import type { ProblemItem, ProblemsPaneDefinition } from '../panes/definitions/problemsPane';
import type { PaneExecutionContext, PaneOutput } from '../panes/paneDefinition';
import { createDefaultPaneRegistry, type PaneRegistry } from '../panes/paneRegistry';
import { type RelationItem, RelationsTreeProvider } from '../providers/relationsTreeProvider';
import type { SymbolResolver } from '../services/symbolResolver';
import type { PanePipelineManager } from './panePipelineManager';

export type FacetSlotItem = vscode.Uri | DirectoryNode | FacetSymbolNode | ProblemItem | RelationItem;
export type { DirectoryNode, ProblemItem, RelationItem };

export class FacetCoordinator implements vscode.Disposable {
  private cancellationSource?: vscode.CancellationTokenSource;
  private debounceTimer?: NodeJS.Timeout;
  private selectionDebounceTimer?: NodeJS.Timeout;
  private currentEditor?: vscode.TextEditor;

  private cachedWorkspaceTypes: FacetSymbolNode[] = [];
  private cachedWorkspaceFiles: vscode.Uri[] = [];
  private cachedDocumentSymbols: FacetSymbolNode[] = [];
  private cachedDocumentUri?: string;
  private cachedDocumentVersion?: number;
  private isInternalSelection = false;
  private slotSelections = new Map<string, readonly FacetSlotItem[]>();
  private pipelineManager?: PanePipelineManager;
  private documentChangeDebounceTimer?: NodeJS.Timeout;

  private _onDidRefreshSlot = new vscode.EventEmitter<string>();
  readonly onDidRefreshSlot = this._onDidRefreshSlot.event;

  private _onDidRefreshAll = new vscode.EventEmitter<void>();
  readonly onDidRefreshAll = this._onDidRefreshAll.event;

  private _onRevealInView = new vscode.EventEmitter<{ slotId: string; node: FacetSlotItem }>();
  readonly onRevealInView = this._onRevealInView.event;

  constructor(
    public readonly resolver: SymbolResolver,
    public readonly relationsProvider: RelationsTreeProvider = new RelationsTreeProvider(),
    public readonly registry: PaneRegistry = createDefaultPaneRegistry(),
  ) {}

  public setPipelineManager(pm: PanePipelineManager): void {
    this.pipelineManager = pm;
  }

  public getPipelineManager(): PanePipelineManager | undefined {
    return this.pipelineManager;
  }

  public getCurrentEditor(): vscode.TextEditor | undefined {
    return this.currentEditor;
  }

  public getCachedWorkspaceFiles(): vscode.Uri[] {
    return this.cachedWorkspaceFiles;
  }

  public setCachedWorkspaceFiles(files: vscode.Uri[]): void {
    this.cachedWorkspaceFiles = files;
  }

  public getCachedWorkspaceTypes(): FacetSymbolNode[] {
    return this.cachedWorkspaceTypes;
  }

  public setCachedWorkspaceTypes(types: FacetSymbolNode[]): void {
    this.cachedWorkspaceTypes = types;
  }

  public getCachedDocumentSymbols(): FacetSymbolNode[] {
    return this.cachedDocumentSymbols;
  }

  public setCachedDocumentSymbols(symbols: FacetSymbolNode[]): void {
    this.cachedDocumentSymbols = symbols;
  }

  public getSlotSelection<T = FacetSlotItem>(slotId: string): readonly T[] {
    return (this.slotSelections.get(slotId) ?? []) as unknown as readonly T[];
  }

  public setSlotSelection(slotId: string, selection: readonly FacetSlotItem[]): void {
    this.slotSelections.set(slotId, selection);
  }

  public clearSlotSelections(): void {
    this.slotSelections.clear();
  }

  public refreshSlot(slotId: string): void {
    this._onDidRefreshSlot.fire(slotId);
  }

  public refreshAll(): void {
    this._onDidRefreshAll.fire();
  }

  public refreshAffectedPanes(roles: readonly string[]): void {
    if (!this.pipelineManager) {
      return;
    }
    const visible = this.pipelineManager.getVisiblePanes();
    for (const pane of visible) {
      if (roles.includes(pane.role)) {
        this.refreshSlot(pane.id);
      }
    }
  }

  public handleDocumentChange(document: vscode.TextDocument): void {
    if (this.currentEditor?.document.uri.toString() === document.uri.toString()) {
      this.cachedDocumentSymbols = [];
      this.cachedDocumentUri = undefined;
      this.cachedDocumentVersion = undefined;
    }
    this.resolver.invalidateCache(document.uri);

    if (this.documentChangeDebounceTimer) {
      clearTimeout(this.documentChangeDebounceTimer);
    }
    this.documentChangeDebounceTimer = setTimeout(() => {
      this.refreshAffectedPanes([
        'symbols',
        'hierarchy',
        'callers',
        'references',
        'definitions',
        'declarations',
        'implementations',
        'changes',
      ]);
    }, 250);
  }

  public handleDiagnosticsChange(_uris?: readonly vscode.Uri[]): void {
    this.refreshAffectedPanes(['problems']);
  }

  public handleFileSystemChange(): void {
    this.cachedWorkspaceFiles = [];
    this.cachedWorkspaceTypes = [];
    this.resolver.clearCache();
    this.refreshAll();
  }

  public handleEditorChange(editor: vscode.TextEditor | undefined): void {
    this.currentEditor = editor;
    this.scheduleSync();
  }

  public scheduleSelectionChange(editor: vscode.TextEditor): void {
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
    }
    this.selectionDebounceTimer = setTimeout(() => {
      void this.handleSelectionChange(editor);
    }, 150);
  }

  public async handleSelectionChange(
    editor: vscode.TextEditor,
    options?: { force?: boolean },
  ): Promise<string | undefined> {
    if (this.isInternalSelection) {
      return undefined;
    }
    const force = options?.force ?? false;
    if (!force) {
      const autoSync = vscode.workspace.getConfiguration?.('facet')?.get<boolean>('autoSyncCursor', true) ?? true;
      if (!autoSync) {
        return undefined;
      }
    }
    this.currentEditor = editor;

    const currentVersion = editor.document.version;
    if (
      !this.cachedDocumentSymbols ||
      this.cachedDocumentSymbols.length === 0 ||
      this.cachedDocumentUri !== editor.document.uri.toString() ||
      (this.cachedDocumentVersion !== undefined && this.cachedDocumentVersion !== currentVersion)
    ) {
      try {
        this.cachedDocumentSymbols = await this.resolver.resolveDocumentSymbols(editor.document);
        this.cachedDocumentUri = editor.document.uri.toString();
        this.cachedDocumentVersion = currentVersion;
      } catch {
        // ignore
      }
    }

    if (!this.pipelineManager) {
      return undefined;
    }

    const visible = this.pipelineManager.getVisiblePanes();
    const hasCursorPane = visible.some((p) => p.selectionSource === 'cursor' && (!p.pinned || force));
    if (!hasCursorPane && !force) {
      return undefined;
    }

    let lastCursorIdx = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].selectionSource === 'cursor' && (!visible[i].pinned || force)) {
        lastCursorIdx = i;
        break;
      }
    }
    if (lastCursorIdx === -1) {
      for (let i = 0; i < visible.length; i++) {
        if (visible[i].inputSource === 'previousPane' && (!visible[i].pinned || force)) {
          lastCursorIdx = Math.max(0, i - 1);
          break;
        }
      }
    }
    if (lastCursorIdx === -1 && force && visible.length > 0) {
      lastCursorIdx = visible.length - 1;
    }

    const enclosingType = this.findEnclosingTypeAtCursor();
    const memberAtCursor = this.findMemberAtCursor();
    const docUri = this.currentEditor.document.uri;
    let targetSlotId: string | undefined;

    for (let i = 0; i <= lastCursorIdx; i++) {
      const pane = visible[i];
      if (pane.pinned && !force) {
        continue;
      }
      const shouldUpdate = force || pane.selectionSource === 'cursor' || i < lastCursorIdx;
      if (!shouldUpdate) {
        continue;
      }

      const currentSel = this.getSlotSelection(pane.id);
      // Protect multi-selections: if user has multiple items selected in this pane, do not overwrite unless forced
      if (!force && currentSel.length > 1) {
        continue;
      }

      let rawTarget: FacetSlotItem | undefined;
      if (pane.role === 'directories') {
        rawTarget = docUri;
      } else if (pane.role === 'files' || pane.role === 'changes') {
        rawTarget = docUri;
      } else if (pane.role === 'symbols') {
        const upstream = this.getPreviousPane(pane.id);
        const upstreamIsType = upstream && upstream.role === 'symbols';
        if (pane.inputSource === 'previousPane' && upstreamIsType) {
          rawTarget = memberAtCursor ?? enclosingType;
        } else {
          rawTarget = enclosingType ?? memberAtCursor;
        }
      } else if (pane.role === 'hierarchy') {
        rawTarget = enclosingType;
      } else if (pane.role === 'problems') {
        const pos = this.currentEditor.selection.active;
        const diags = vscode.languages.getDiagnostics(docUri);
        const matchDiag = diags.find((d) => d.range.contains(pos));
        if (matchDiag) {
          const probDef = this.registry.get('problems') as ProblemsPaneDefinition;
          rawTarget = probDef.createProblemItem ? probDef.createProblemItem(docUri, matchDiag) : undefined;
        }
      }

      if (!rawTarget) {
        continue;
      }

      const matchingItem = await this.findMatchingSlotItem(pane, rawTarget);
      const itemToSet = matchingItem ?? rawTarget;

      // Redundancy guard: do not re-select or re-reveal if already selected
      if (!force && currentSel.length === 1 && this.isSameSlotItem(currentSel[0], itemToSet)) {
        targetSlotId = pane.id;
        continue;
      }

      this.setSlotSelection(pane.id, [itemToSet]);
      this._onRevealInView.fire({ slotId: pane.id, node: itemToSet });
      targetSlotId = pane.id;

      for (const other of visible) {
        if (other.id !== pane.id && other.inputSource === 'previousPane' && (!other.pinned || force)) {
          const upstream = this.getPreviousPane(other.id);
          if (upstream && upstream.id === pane.id) {
            this.refreshSlot(other.id);
          }
        }
      }
    }

    return targetSlotId;
  }

  public async findMatchingSlotItem(pane: PaneConfig, target: FacetSlotItem): Promise<FacetSlotItem | undefined> {
    if (!target) {
      return undefined;
    }
    if (pane.role === 'directories') {
      const items = (await this.getSlotChildren(pane)) as DirectoryNode[];
      const targetPath =
        target instanceof vscode.Uri ? target.fsPath : ((target as { uri?: vscode.Uri }).uri?.fsPath ?? '');
      const findDir = (list: DirectoryNode[]): DirectoryNode | undefined => {
        for (const d of list) {
          if (targetPath.startsWith(d.uri.fsPath)) {
            if (d.children && d.children.length > 0) {
              const deeper = findDir(d.children);
              if (deeper) {
                return deeper;
              }
            }
            return d;
          }
        }
        return undefined;
      };
      return findDir(items);
    }
    if (target instanceof vscode.Uri) {
      const items = await this.getSlotChildren(pane);
      return items.find((item) => item instanceof vscode.Uri && item.fsPath === target.fsPath);
    }
    if (
      pane.role === 'problems' &&
      target &&
      typeof target === 'object' &&
      'type' in target &&
      target.type === 'problem'
    ) {
      const items = (await this.getSlotChildren(pane)) as ProblemItem[];
      const probTarget = target as ProblemItem;
      return items.find(
        (p) =>
          p.uri.fsPath === probTarget.uri.fsPath &&
          p.range.start.line === probTarget.range.start.line &&
          p.range.start.character === probTarget.range.start.character,
      );
    }
    if (pane.role === 'symbols' || pane.role === 'hierarchy') {
      const items = (await this.getSlotChildren(pane)) as FacetSymbolNode[];
      const symTarget = target as Partial<FacetSymbolNode>;
      const search = (list: FacetSymbolNode[]): FacetSymbolNode | undefined => {
        for (const item of list) {
          if (
            item.name === symTarget.name &&
            (item.uri?.fsPath === symTarget.uri?.fsPath || !symTarget.uri) &&
            (symTarget.kind === undefined || item.kind === symTarget.kind)
          ) {
            return item;
          }
          if (item.subTypes && item.subTypes.length > 0) {
            const found = search(item.subTypes);
            if (found) {
              return found;
            }
          }
          if (item.children && item.children.length > 0) {
            const found = search(item.children);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      };
      return search(items);
    }
    return undefined;
  }

  public handlePaneSelectionSourceChange(slotId: string): void {
    if (!this.pipelineManager) {
      return;
    }
    const pane = this.pipelineManager.getPane(slotId);
    if (!pane) {
      return;
    }

    if (pane.selectionSource === 'none') {
      this.setSlotSelection(slotId, []);
      this.refreshSlot(slotId);
    } else if (pane.selectionSource === 'all') {
      void this.getSlotChildren(pane).then((items) => {
        this.setSlotSelection(slotId, items);
        this.refreshSlot(slotId);
      });
    } else if (pane.selectionSource === 'cursor' && this.currentEditor) {
      void this.handleSelectionChange(this.currentEditor);
    }
  }

  public scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.sync();
    }, 150);
  }

  public async sync(externalToken?: vscode.CancellationToken): Promise<void> {
    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
    }
    this.cancellationSource = new vscode.CancellationTokenSource();
    const token = this.cancellationSource.token;

    if (externalToken?.isCancellationRequested) {
      return;
    }

    try {
      this.cachedWorkspaceFiles = [];
      this.cachedWorkspaceTypes = [];
      this.cachedDocumentSymbols = [];

      if (this.currentEditor && !token.isCancellationRequested && !externalToken?.isCancellationRequested) {
        try {
          this.cachedDocumentSymbols = await this.resolver.resolveDocumentSymbols(
            this.currentEditor.document,
            externalToken ?? token,
          );
          this.cachedDocumentUri = this.currentEditor.document.uri.toString();
          this.cachedDocumentVersion = this.currentEditor.document.version;
        } catch {
          this.cachedDocumentSymbols = [];
        }
      }

      if (token.isCancellationRequested || externalToken?.isCancellationRequested) {
        return;
      }

      this.refreshAll();

      if (this.currentEditor) {
        void this.handleSelectionChange(this.currentEditor);
      }
    } catch (err) {
      if (!token.isCancellationRequested && !externalToken?.isCancellationRequested) {
        console.error('Facet sync error:', err);
      }
    }
  }

  public async refresh(token?: vscode.CancellationToken): Promise<void> {
    return this.sync(token);
  }

  public async handleSlotSelection(slotId: string, selection: readonly FacetSlotItem[]): Promise<void> {
    this.isInternalSelection = true;
    try {
      this.slotSelections.set(slotId, selection);

      if (selection.length === 1) {
        const first = selection[0];
        if (first instanceof vscode.Uri) {
          const currentDoc = this.currentEditor?.document;
          if (!currentDoc || currentDoc.uri.fsPath !== first.fsPath) {
            await vscode.commands.executeCommand('vscode.open', first);
          }
        } else if (first && typeof first === 'object' && 'type' in first && first.type === 'directory') {
          // Directory selection filters downstream panes
        } else if (first && typeof first === 'object' && 'type' in first && first.type === 'problem') {
          await vscode.commands.executeCommand('facet.revealRange', first.uri, first.range);
        } else if (first && typeof first === 'object' && 'uri' in first && first.uri) {
          const sym = first as Partial<FacetSymbolNode>;
          const targetRange: vscode.Range | undefined = sym.selectionRange ?? sym.range;
          if (targetRange) {
            const currentDoc = this.currentEditor?.document;
            const currentSel = this.currentEditor?.selection;
            const sameFile = currentDoc && currentDoc.uri.fsPath === first.uri.fsPath;
            const alreadyAtTarget =
              sameFile &&
              currentSel &&
              (currentSel.contains(targetRange.start) ||
                (currentSel.start.line === targetRange.start.line &&
                  currentSel.start.character === targetRange.start.character));

            if (!alreadyAtTarget) {
              await vscode.commands.executeCommand('facet.revealRange', first.uri, targetRange);
            }
          }
        }
      }

      if (this.pipelineManager) {
        const visible = this.pipelineManager.getVisiblePanes();
        for (const other of visible) {
          if (other.id !== slotId && other.inputSource === 'previousPane') {
            const upstream = this.getPreviousPane(other.id);
            if (upstream && upstream.id === slotId) {
              this.refreshSlot(other.id);
              if (other.selectionSource === 'all') {
                this.handlePaneSelectionSourceChange(other.id);
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

  public getPreviousPaneSelection(slotId: string): readonly FacetSlotItem[] {
    const prev = this.getPreviousPane(slotId);
    return prev ? this.getSlotSelection(prev.id) : [];
  }

  public async getUpstreamOutput(slotId: string): Promise<PaneOutput> {
    const prev = this.getPreviousPane(slotId);
    if (!prev) {
      return {};
    }
    const def = this.registry.tryGet(prev.role);
    let items = this.getSlotSelection(prev.id);
    if (items.length === 0) {
      items = await this.getSlotChildren(prev);
    }
    if (!def) {
      const uris = items
        .map((i) => (i instanceof vscode.Uri ? i : (i as { uri?: vscode.Uri })?.uri))
        .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
      return { items: Array.from(items), uris };
    }
    const context: PaneExecutionContext = {
      config: prev,
      slotId: prev.id,
      coordinator: this,
      upstreamOutput: {},
      activeEditor: this.currentEditor,
      cancellationToken: this.cancellationSource?.token,
    };
    return def.getOutput(items, context);
  }

  public async getSlotChildren<T = FacetSlotItem>(
    config: PaneConfig,
    element?: unknown,
    token?: vscode.CancellationToken,
  ): Promise<T[]> {
    const def = this.registry.get(config.role);
    const upstreamOutput = await this.getUpstreamOutput(config.id);

    const context: PaneExecutionContext = {
      config,
      slotId: config.id,
      coordinator: this,
      upstreamOutput,
      activeEditor: this.currentEditor,
      cancellationToken: token ?? this.cancellationSource?.token,
    };

    return (await def.getChildren(context, element)) as T[];
  }

  public getSlotTreeItem(config: PaneConfig, element: FacetSlotItem): vscode.TreeItem {
    const def = this.registry.get(config.role);
    const context: PaneExecutionContext = {
      config,
      slotId: config.id,
      coordinator: this,
      upstreamOutput: {},
      activeEditor: this.currentEditor,
      cancellationToken: this.cancellationSource?.token,
    };
    return def.getTreeItem(element, context);
  }

  public getSlotParent<T = FacetSlotItem>(config: PaneConfig, element: T): T | undefined {
    const def = this.registry.get(config.role);
    if (def.getParent) {
      const context: PaneExecutionContext = {
        config,
        slotId: config.id,
        coordinator: this,
        upstreamOutput: {},
        activeEditor: this.currentEditor,
        cancellationToken: this.cancellationSource?.token,
      };
      return def.getParent(element, context) as T | undefined;
    }
    if (element && typeof element === 'object' && 'parent' in element) {
      return (element as { parent?: T }).parent;
    }
    return undefined;
  }

  public getOpenEditorUris(): vscode.Uri[] {
    const openUris = new Map<string, vscode.Uri>();
    if (vscode.window.tabGroups?.all) {
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input;
          if (input && typeof input === 'object' && 'uri' in input) {
            const maybeUri = (input as { uri?: unknown }).uri;
            if (maybeUri instanceof vscode.Uri) {
              openUris.set(maybeUri.fsPath, maybeUri);
            }
          }
        }
      }
    }
    if (openUris.size === 0 && vscode.workspace.textDocuments) {
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.uri.scheme === 'file') {
          openUris.set(doc.uri.fsPath, doc.uri);
        }
      }
    }
    return Array.from(openUris.values());
  }

  public async hydrateMissingSuperTypes(types: FacetSymbolNode[]): Promise<void> {
    const missing = types.filter((t) => t.superTypes === undefined && t.uri);
    if (missing.length === 0) {
      return;
    }

    // Tier 1: Try LSP Type Hierarchy supertypes
    for (const t of missing) {
      const lspSupertypes = await this.resolver.resolveTypeHierarchySupertypes(t, this.cancellationSource?.token);
      if (lspSupertypes && lspSupertypes.length > 0) {
        t.superTypes = lspSupertypes;
      }
    }

    const stillMissing = missing.filter((t) => t.superTypes === undefined);
    if (stillMissing.length === 0) {
      return;
    }

    // Tier 2: Text / regex AST extraction
    const byUri = new Map<string, FacetSymbolNode[]>();
    for (const t of stillMissing) {
      const uriStr = t.uri.toString();
      const list = byUri.get(uriStr) ?? [];
      list.push(t);
      byUri.set(uriStr, list);
    }

    for (const [uriStr, typeGroup] of byUri.entries()) {
      let lines: string[] | undefined;
      const textDocs = vscode.workspace.textDocuments ?? [];
      const openDoc = textDocs.find((d) => d.uri.toString() === uriStr);
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

  public findEnclosingTypeAtCursor(): FacetSymbolNode | undefined {
    if (!this.currentEditor) {
      return undefined;
    }
    const pos = this.currentEditor.selection.active;
    return this.cachedDocumentSymbols.find((s) => isTypeKind(s.kind) && s.range.contains(pos));
  }

  public findMemberAtCursor(): FacetSymbolNode | undefined {
    const parentType = this.findEnclosingTypeAtCursor();
    if (!parentType || !this.currentEditor) {
      return undefined;
    }
    const pos = this.currentEditor.selection.active;
    return parentType.children.find((c) => c.range.contains(pos));
  }

  public async revealRange(uri: vscode.Uri, range: vscode.Range): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.end);
  }

  public isSameSlotItem(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
      return false;
    }
    if (a instanceof vscode.Uri && b instanceof vscode.Uri) {
      return a.fsPath === b.fsPath;
    }
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    if (objA.type === 'directory' && objB.type === 'directory') {
      const dirA = a as DirectoryNode;
      const dirB = b as DirectoryNode;
      return dirA.uri?.fsPath === dirB.uri?.fsPath;
    }
    if (objA.type === 'problem' && objB.type === 'problem') {
      const probA = a as ProblemItem;
      const probB = b as ProblemItem;
      return (
        probA.uri?.fsPath === probB.uri?.fsPath &&
        probA.range?.start?.line === probB.range?.start?.line &&
        probA.range?.start?.character === probB.range?.start?.character
      );
    }
    if (objA.name !== undefined && objB.name !== undefined) {
      const nodeA = a as FacetSymbolNode;
      const nodeB = b as FacetSymbolNode;
      return (
        nodeA.name === nodeB.name &&
        nodeA.kind === nodeB.kind &&
        nodeA.uri?.fsPath === nodeB.uri?.fsPath &&
        nodeA.range?.start?.line === nodeB.range?.start?.line
      );
    }
    if (objA.label !== undefined && objB.label !== undefined && 'uri' in objA && 'uri' in objB) {
      const itemA = a as RelationItem;
      const itemB = b as RelationItem;
      return (
        itemA.label === itemB.label &&
        itemA.uri?.fsPath === itemB.uri?.fsPath &&
        itemA.range?.start?.line === itemB.range?.start?.line
      );
    }
    return false;
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
      this.selectionDebounceTimer = undefined;
    }
    if (this.documentChangeDebounceTimer) {
      clearTimeout(this.documentChangeDebounceTimer);
      this.documentChangeDebounceTimer = undefined;
    }
    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
      this.cancellationSource = undefined;
    }
    this._onDidRefreshSlot.dispose?.();
    this._onDidRefreshAll.dispose?.();
    this._onRevealInView.dispose?.();
  }
}
