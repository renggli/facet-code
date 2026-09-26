import * as vscode from 'vscode';
import { SymbolResolver } from '../services/symbolResolver';
import { RelationsTreeProvider, RelationItem } from '../providers/relationsTreeProvider';
import {
  FacetSymbolNode,
  isTypeKind,
  unionMembers,
  getSymbolIcon,
  extractSuperTypes,
  extractTypeHeader,
  buildTypeHierarchy
} from '../models/symbolNode';
import { PaneConfig, FilesPaneConfig, SortOption, matchesPaneFilters, matchesGlob } from '../models/paneConfig';
import { PanePipelineManager } from './panePipelineManager';

export interface DirectoryNode {
  type: 'directory';
  uri: vscode.Uri;
  name: string;
  relativePath: string;
  parent?: DirectoryNode;
  children?: DirectoryNode[];
}

export interface ProblemItem {
  type: 'problem';
  label: string;
  message: string;
  description: string;
  tooltip: string;
  severity: vscode.DiagnosticSeverity;
  uri: vscode.Uri;
  range: vscode.Range;
  iconPath: vscode.ThemeIcon;
}

export class FacetCoordinator implements vscode.Disposable {
  private cancellationSource?: vscode.CancellationTokenSource;
  private debounceTimer?: NodeJS.Timeout;
  private currentEditor?: vscode.TextEditor;

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
    public readonly relationsProvider: RelationsTreeProvider = new RelationsTreeProvider()
  ) {}

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

  public clearSlotSelections(): void {
    this.slotSelections.clear();
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
      if (pane.role === 'directories') {
        rawTarget = docUri;
      } else if (pane.role === 'files' || pane.role === 'changes') {
        rawTarget = docUri;
      } else if (pane.role === 'types' || pane.role === 'hierarchy') {
        rawTarget = enclosingType;
      } else if (pane.role === 'members') {
        rawTarget = memberAtCursor;
      } else if (pane.role === 'problems') {
        const pos = this.currentEditor.selection.active;
        const diags = vscode.languages.getDiagnostics(docUri);
        const matchDiag = diags.find((d) => d.range.contains(pos));
        if (matchDiag) {
          rawTarget = this.createProblemItem(docUri, matchDiag);
        }
      }

      if (!rawTarget) {
        continue;
      }

      const matchingItem = await this.findMatchingSlotItem(pane, rawTarget);
      const itemToSet = matchingItem || rawTarget;
      this.setSlotSelection(pane.id, [itemToSet]);
      this._onRevealInView.fire({ slotId: pane.id, node: itemToSet });

      for (const other of visible) {
        if (other.id !== pane.id && other.inputSource === 'previousPane') {
          const upstream = this.getPreviousPane(other.id);
          if (upstream && upstream.id === pane.id) {
            this.refreshSlot(other.id);
          }
        }
      }
    }
  }

  public async findMatchingSlotItem(pane: PaneConfig, target: any): Promise<any | undefined> {
    if (!target) {
      return undefined;
    }
    if (pane.role === 'directories') {
      const items = (await this.getSlotChildren(pane)) as DirectoryNode[];
      const targetPath = target instanceof vscode.Uri ? target.fsPath : (target?.uri?.fsPath || '');
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
    if (pane.role === 'problems' && target && target.type === 'problem') {
      const items = (await this.getSlotChildren(pane)) as ProblemItem[];
      return items.find(
        (p) =>
          p.uri.fsPath === target.uri.fsPath &&
          p.range.start.line === target.range.start.line &&
          p.range.start.character === target.range.start.character
      );
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
        // Refresh downstream panes whose input is 'pane' and upstream is this slot
        if (this.pipelineManager) {
          const visible = this.pipelineManager.getVisiblePanes();
          for (const other of visible) {
            if (other.id !== slotId && other.inputSource === 'previousPane') {
              const upstream = this.getPreviousPane(other.id);
              if (upstream && upstream.id === slotId) {
                this.refreshSlot(other.id);
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
          const currentDoc = this.currentEditor?.document;
          if (!currentDoc || currentDoc.uri.fsPath !== first.fsPath) {
            await vscode.commands.executeCommand('vscode.open', first);
          }
        } else if (first?.type === 'directory') {
          // Directory selection filters downstream panes
        } else if (first?.type === 'problem') {
          await vscode.commands.executeCommand('facet.revealRange', first.uri, first.range);
        } else if (first.uri && (first.selectionRange || first.range)) {
          const targetRange: vscode.Range = first.selectionRange || first.range;
          const currentDoc = this.currentEditor?.document;
          const currentSel = this.currentEditor?.selection;
          const sameFile = currentDoc && currentDoc.uri.fsPath === first.uri.fsPath;
          const alreadyAtTarget = sameFile && currentSel && (
            currentSel.contains(targetRange.start) ||
            (currentSel.start.line === targetRange.start.line && currentSel.start.character === targetRange.start.character)
          );

          if (!alreadyAtTarget) {
            await vscode.commands.executeCommand(
              'facet.revealRange',
              first.uri,
              targetRange
            );
          }
        }
      }

      // Refresh downstream panes whose input is 'previousPane' and upstream is this slot
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

  public getPreviousPaneSelection(slotId: string): readonly any[] {
    const prev = this.getPreviousPane(slotId);
    return prev ? this.getSlotSelection(prev.id) : [];
  }

  public async getSlotChildren(config: PaneConfig, element?: any): Promise<any[]> {
    switch (config.role) {
      case 'directories':
        return this.getDirectoryChildren(config, element);
      case 'files':
        return this.getFileChildren(config);
      case 'types':
        return this.getTypeChildren(config, element);
      case 'members':
        return this.getMemberChildren(config, element);
      case 'definitions':
        return this.getRelationChildren(config, 'definitions');
      case 'declarations':
        return this.getRelationChildren(config, 'declarations');
      case 'implementations':
        return this.getRelationChildren(config, 'implementations');
      case 'references':
        return this.getRelationChildren(config, 'references');
      case 'callers':
        return this.getRelationChildren(config, 'callers');
      case 'problems':
        return this.getProblemChildren(config);
      case 'changes':
        return this.getChangeChildren(config);
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

  public getOpenEditorUris(): vscode.Uri[] {
    const openUris = new Map<string, vscode.Uri>();
    if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input as any;
          if (input && input.uri instanceof vscode.Uri) {
            openUris.set(input.uri.fsPath, input.uri);
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

  private async getDirectoryChildren(config: PaneConfig, element?: any): Promise<DirectoryNode[]> {
    if (element && element.type === 'directory') {
      return element.children || [];
    }

    let candidateUris: vscode.Uri[] = [];
    if (config.inputSource === 'project') {
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
      candidateUris = this.cachedWorkspaceFiles;
    } else if (config.inputSource === 'openEditors') {
      candidateUris = this.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      const activeUri = this.currentEditor?.document.uri || vscode.window.activeTextEditor?.document.uri;
      if (activeUri) {
        candidateUris = [activeUri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      candidateUris = prevSel
        .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
        .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
    }

    // Extract base directories from candidates
    const baseDirMap = new Map<string, { uri: vscode.Uri; relPath: string; name: string }>();

    const prevSel = config.inputSource === 'previousPane' ? this.getPreviousPaneSelection(config.id) : [];
    const prevDirNodes = prevSel.filter((item) => item?.type === 'directory');

    for (const dNode of prevDirNodes) {
      if (dNode.relativePath) {
        const normRel = dNode.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (normRel && normRel !== '.') {
          baseDirMap.set(normRel, {
            uri: dNode.uri,
            relPath: normRel,
            name: dNode.name || normRel.split('/').pop() || normRel
          });
        }
      }
    }

    for (const uri of candidateUris) {
      const fullPath = uri.fsPath;
      const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
      if (lastSlash > 0) {
        const dirPath = fullPath.slice(0, lastSlash);
        const dirUri = vscode.Uri.file(dirPath);
        let relPath = '';
        try {
          relPath = (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(dirUri) : dirUri.fsPath) || '';
        } catch {
          relPath = dirPath;
        }
        relPath = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (relPath && relPath !== '.') {
          const name = relPath.split('/').pop() || relPath;
          if (!baseDirMap.has(relPath)) {
            baseDirMap.set(relPath, { uri: dirUri, relPath, name });
          }
        }
      }
    }

    // Synthesize all ancestor path segments from baseDirMap
    const allDirsMap = new Map<string, { uri: vscode.Uri; relPath: string; name: string }>();

    for (const base of baseDirMap.values()) {
      const parts = base.relPath.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!allDirsMap.has(currentPath)) {
          let segUri = base.uri;
          if (currentPath === base.relPath) {
            segUri = base.uri;
          } else {
            try {
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                segUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, currentPath);
              } else {
                segUri = vscode.Uri.file(currentPath);
              }
            } catch {
              segUri = base.uri;
            }
          }
          allDirsMap.set(currentPath, {
            uri: segUri,
            relPath: currentPath,
            name: parts[i]
          });
        }
      }
    }

    const pattern = 'globPattern' in config ? config.globPattern : undefined;

    const display = 'display' in config ? config.display : 'flat';

    if (display === 'current') {
      let currentDirs: { uri: vscode.Uri; relPath: string; name: string }[] = [];
      if (config.inputSource === 'previousPane') {
        const prevSelDirs = prevSel.filter((item) => item?.type === 'directory');
        if (prevSelDirs.length > 0) {
          const matchedSubDirs = new Map<string, { uri: vscode.Uri; relPath: string; name: string }>();
          for (const dNode of prevSelDirs) {
            const parentRel = (dNode.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
            for (const item of allDirsMap.values()) {
              if (item.relPath !== parentRel) {
                const prefix = parentRel ? `${parentRel}/` : '';
                if (item.relPath.startsWith(prefix)) {
                  const subRel = item.relPath.slice(prefix.length);
                  if (!subRel.includes('/')) {
                    matchedSubDirs.set(item.relPath, item);
                  }
                }
              }
            }
          }
          currentDirs = Array.from(matchedSubDirs.values());
        } else {
          currentDirs = Array.from(allDirsMap.values());
        }
      } else {
        // Project or openEditors: top-level project items (no '/' in relPath)
        currentDirs = Array.from(allDirsMap.values()).filter((d) => !d.relPath.includes('/'));
      }

      const currentNodes: DirectoryNode[] = currentDirs
        .filter((d) => matchesGlob(d.relPath, pattern) || matchesGlob(d.name, pattern))
        .map((d) => ({
          type: 'directory',
          uri: d.uri,
          name: d.name,
          relativePath: d.relPath
        }));

      currentNodes.sort((a, b) =>
        config.sort === 'name' ? a.name.localeCompare(b.name) : a.relativePath.localeCompare(b.relativePath)
      );
      return currentNodes;
    }

    if (display === 'flat') {
      const flatNodes: DirectoryNode[] = Array.from(baseDirMap.values())
        .filter((d) => matchesGlob(d.relPath, pattern) || matchesGlob(d.name, pattern))
        .map((d) => ({
          type: 'directory',
          uri: d.uri,
          name: d.name,
          relativePath: d.relPath
        }));

      flatNodes.sort((a, b) =>
        config.sort === 'name' ? a.name.localeCompare(b.name) : a.relativePath.localeCompare(b.relativePath)
      );
      return flatNodes;
    }

    // Hierarchy mode

    // 2. Build DirectoryNode map
    const nodeMap = new Map<string, DirectoryNode>();
    for (const d of allDirsMap.values()) {
      nodeMap.set(d.relPath, {
        type: 'directory',
        uri: d.uri,
        name: d.name,
        relativePath: d.relPath,
        children: []
      });
    }

    // 3. Link parent and children
    const childRelPaths = new Set<string>();

    for (const [relPath, node] of nodeMap) {
      const lastSlash = relPath.lastIndexOf('/');
      if (lastSlash !== -1) {
        const parentRel = relPath.slice(0, lastSlash);
        const parentNode = nodeMap.get(parentRel);
        if (parentNode) {
          node.parent = parentNode;
          parentNode.children = parentNode.children || [];
          if (!parentNode.children.some((c) => c.relativePath === node.relativePath)) {
            parentNode.children.push(node);
          }
          childRelPaths.add(relPath);
        }
      }
    }

    // 4. Leaf-based filtering
    const matchesDirectoryFilter = (node: DirectoryNode): boolean => {
      if (!pattern || !pattern.trim()) {
        return true;
      }
      return (
        matchesGlob(node.relativePath, pattern) ||
        matchesGlob(node.name, pattern) ||
        node.relativePath.split('/').some((part) => matchesGlob(part, pattern))
      );
    };

    const filterLeaves = (node: DirectoryNode): boolean => {
      if (node.children && node.children.length > 0) {
        node.children = node.children.filter((child) => filterLeaves(child));
        if (node.children.length > 0) {
          return true;
        }
      }
      return matchesDirectoryFilter(node);
    };

    // 5. Roots extraction, strictly removing duplicates nested elsewhere
    const rootNodes: DirectoryNode[] = [];
    const rootSeen = new Set<string>();

    const allNodes = Array.from(nodeMap.values()).sort(
      (a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length
    );

    for (const node of allNodes) {
      if (childRelPaths.has(node.relativePath) || node.parent !== undefined) {
        continue;
      }
      if (rootSeen.has(node.relativePath)) {
        continue;
      }

      if (filterLeaves(node)) {
        rootSeen.add(node.relativePath);
        rootNodes.push(node);
      }
    }

    const sortNodes = (nodes: DirectoryNode[]) => {
      nodes.sort((a, b) =>
        config.sort === 'name' ? a.name.localeCompare(b.name) : a.relativePath.localeCompare(b.relativePath)
      );
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          sortNodes(n.children);
        }
      }
    };
    sortNodes(rootNodes);
    return rootNodes;
  }

  private async getFileChildren(config: PaneConfig): Promise<vscode.Uri[]> {
    let files: vscode.Uri[] = [];

    if (config.inputSource === 'project') {
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
    } else if (config.inputSource === 'openEditors') {
      files = this.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      const activeUri = this.currentEditor?.document.uri || vscode.window.activeTextEditor?.document.uri;
      if (activeUri) {
        files = [activeUri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      const dirPaths = prevSel
        .filter((item) => item?.type === 'directory' || (item instanceof vscode.Uri && !item.path.includes('.')))
        .map((item) => (item?.uri ? item.uri.fsPath : item.fsPath));

      if (dirPaths.length > 0) {
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
        const displayMode = (config as FilesPaneConfig).display;
        const isRecursive = displayMode !== 'current';
        files = this.cachedWorkspaceFiles.filter((file) => {
          const normFile = file.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
          return dirPaths.some((dir) => {
            const normDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
            if (isRecursive) {
              return normFile.startsWith(normDir + '/');
            } else {
              const lastSlash = normFile.lastIndexOf('/');
              const fileDir = lastSlash !== -1 ? normFile.slice(0, lastSlash) : '';
              return fileDir === normDir;
            }
          });
        });
      } else {
        const rawFiles = prevSel
          .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
          .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
        if (rawFiles.length === 0) {
          const prevPane = this.getPreviousPane(config.id);
          if (prevPane) {
            const prevChildren = await this.getSlotChildren(prevPane);
            rawFiles.push(
              ...prevChildren
                .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
                .filter((u): u is vscode.Uri => u instanceof vscode.Uri)
            );
          }
        }
        const seen = new Set<string>();
        files = rawFiles.filter((u) => {
          if (seen.has(u.fsPath)) {
            return false;
          }
          seen.add(u.fsPath);
          return true;
        });
      }
    }

    // Top-level filter if display is 'current' with project or openEditors input
    const display = (config as FilesPaneConfig).display;
    if (display === 'current' && config.inputSource !== 'previousPane') {
      files = files.filter((u) => {
        const rel = (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(u) : u.fsPath).replace(/\\/g, '/');
        return !rel.includes('/');
      });
    }

    const pattern = 'globPattern' in config ? config.globPattern : undefined;

    if (pattern && pattern.trim()) {
      files = files.filter((u) => {
        const relPath = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(u) : u.fsPath;
        return matchesGlob(relPath, pattern);
      });
    }

    // Stable sort files with deterministic secondary tie-breaker (full path)
    files.sort((a, b) => {
      const pathA = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(a) : a.fsPath;
      const pathB = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(b) : b.fsPath;
      if (config.sort === 'name') {
        const nameA = a.path.split('/').pop() || '';
        const nameB = b.path.split('/').pop() || '';
        const diff = nameA.localeCompare(nameB);
        if (diff !== 0) {
          return diff;
        }
      }
      return pathA.localeCompare(pathB);
    });

    return files;
  }

  private sortItems<T extends FacetSymbolNode>(items: T[], sort: SortOption): T[] {
    const copy = items.slice();
    return copy.sort((a, b) => {
      const uriA = a.uri ? (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(a.uri) : a.uri.fsPath) : '';
      const uriB = b.uri ? (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(b.uri) : b.uri.fsPath) : '';
      const uriDiff = uriA.localeCompare(uriB);

      const lineDiff = (a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0);
      const charDiff = (a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0);

      if (sort === 'category') {
        const kindDiff = a.kind - b.kind;
        if (kindDiff !== 0) {
          return kindDiff;
        }
        const nameDiff = a.name.localeCompare(b.name);
        if (nameDiff !== 0) {
          return nameDiff;
        }
        if (uriDiff !== 0) {
          return uriDiff;
        }
        if (lineDiff !== 0) {
          return lineDiff;
        }
        return charDiff;
      }

      if (sort === 'position') {
        if (uriDiff !== 0) {
          return uriDiff;
        }
        if (lineDiff !== 0) {
          return lineDiff;
        }
        if (charDiff !== 0) {
          return charDiff;
        }
        return a.name.localeCompare(b.name);
      }

      // Default: 'name'
      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) {
        return nameDiff;
      }
      if (uriDiff !== 0) {
        return uriDiff;
      }
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return charDiff;
    });
  }

  private async getTypeChildren(config: PaneConfig, element?: any): Promise<any[]> {
    const display = 'display' in config ? config.display : 'flat';
    const filters = 'filters' in config ? config.filters : undefined;
    const subclassTypes = 'subclassTypes' in config ? config.subclassTypes : undefined;

    if (element) {
      if (display === 'hierarchy') {
        const node = element as FacetSymbolNode;
        const subTypes = node.subTypes || [];
        const filtered = subTypes.filter(
          (c) => isTypeKind(c.kind) && matchesPaneFilters(c, filters)
        );
        return this.sortItems(filtered, config.sort);
      }
      return [];
    }

    let rawTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'project') {
      if (this.cachedWorkspaceTypes.length === 0) {
        this.cachedWorkspaceTypes = await this.resolver.resolveWorkspaceTypes('');
      }
      rawTypes = this.cachedWorkspaceTypes;
    } else if (config.inputSource === 'activeEditor') {
      rawTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'openEditors') {
      const openUris = new Map<string, vscode.Uri>();
      if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            const input = tab.input as any;
            if (input && input.uri instanceof vscode.Uri) {
              openUris.set(input.uri.fsPath, input.uri);
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
      for (const uri of openUris.values()) {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const symbols = await this.resolver.resolveDocumentSymbols(doc);
          const types = this.resolver.extractTypesOnly(symbols);
          rawTypes.push(...types);
        } catch {
          // ignore
        }
      }
    } else if (config.inputSource === 'previousPane') {
      const prev = this.getPreviousPaneSelection(config.id);
      const symbolTypes = prev.filter((s) => s && isTypeKind(s.kind));
      if (symbolTypes.length > 0) {
        rawTypes = symbolTypes;
      } else {
        // Check if previous pane selection contains file URIs
        const fileUris = prev
          .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
          .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        let targetUris = fileUris;
        if (targetUris.length === 0) {
          const prevPane = this.getPreviousPane(config.id);
          if (prevPane) {
            const prevChildren = await this.getSlotChildren(prevPane);
            targetUris = prevChildren
              .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
              .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
          }
        }

        if (targetUris.length > 0) {
          const seenUris = new Set<string>();
          for (const uri of targetUris) {
            if (seenUris.has(uri.fsPath)) {
              continue;
            }
            seenUris.add(uri.fsPath);
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

    if (display === 'hierarchy') {
      let allowedKinds: vscode.SymbolKind[] | undefined;
      if (subclassTypes && subclassTypes.length > 0) {
        const keyMap: Record<string, vscode.SymbolKind> = {
          class: vscode.SymbolKind.Class,
          interface: vscode.SymbolKind.Interface,
          struct: vscode.SymbolKind.Struct,
          enum: vscode.SymbolKind.Enum
        };
        allowedKinds = subclassTypes.map((k) => keyMap[k]).filter((k) => k !== undefined);
      }
      const roots = buildTypeHierarchy(rawTypes, allowedKinds, filters);
      return this.sortItems(roots, config.sort);
    }

    const filtered = rawTypes.filter((t) => matchesPaneFilters(t, filters));
    return this.sortItems(filtered, config.sort);
  }

  private async getMemberChildren(config: PaneConfig, element?: any): Promise<any[]> {
    const display = 'display' in config ? config.display : 'flat';
    const filters = 'filters' in config ? config.filters : undefined;

    if (element) {
      if (display === 'hierarchy' && element.children) {
        const children = (element.children as FacetSymbolNode[]).filter((c) =>
          matchesPaneFilters(c, filters)
        );
        return this.sortItems(children, config.sort);
      }
      return [];
    }

    let targetTypes: FacetSymbolNode[] = [];

    if (config.inputSource === 'previousPane') {
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
    } else if (config.inputSource === 'activeEditor') {
      targetTypes = this.cachedDocumentSymbols.filter((s) => isTypeKind(s.kind));
    } else if (config.inputSource === 'openEditors') {
      const openUris = new Map<string, vscode.Uri>();
      if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            const input = tab.input as any;
            if (input && input.uri instanceof vscode.Uri) {
              openUris.set(input.uri.fsPath, input.uri);
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
      for (const uri of openUris.values()) {
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
    const filtered = rawMembers.filter((m) => matchesPaneFilters(m, filters));

    return this.sortItems(filtered, config.sort);
  }

  private async getRelationChildren(
    config: PaneConfig,
    mode: 'references' | 'callers' | 'implementations' | 'definitions' | 'declarations'
  ): Promise<any[]> {
    let targets: FacetSymbolNode[] = [];

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

    if (targets.length === 0) {
      return [];
    }

    const raw = await this.relationsProvider.fetchRelationsForNodes(targets, mode);
    const filters = 'filters' in config ? config.filters : undefined;
    const filtered = raw.filter((item) => matchesPaneFilters(item, filters));

    return filtered.sort((a, b) => {
      if (config.sort === 'name') {
        return a.label.localeCompare(b.label);
      }
      const uriDiff = a.uri.fsPath.localeCompare(b.uri.fsPath);
      if (uriDiff !== 0) {
        return uriDiff;
      }
      return (a.range.start.line - b.range.start.line) || (a.range.start.character - b.range.start.character);
    });
  }

  private async getProblemChildren(config: PaneConfig): Promise<ProblemItem[]> {
    let candidateUris: vscode.Uri[] = [];

    if (config.inputSource === 'project') {
      const allDiags = vscode.languages.getDiagnostics();
      const items: ProblemItem[] = [];
      for (const [uri, diags] of allDiags) {
        for (const d of diags) {
          items.push(this.createProblemItem(uri, d));
        }
      }
      return this.sortProblems(items, config.sort);
    } else if (config.inputSource === 'openEditors') {
      candidateUris = this.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      if (this.currentEditor?.document.uri) {
        candidateUris = [this.currentEditor.document.uri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      candidateUris = prevSel
        .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
        .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
      if (candidateUris.length === 0) {
        const prevPane = this.getPreviousPane(config.id);
        if (prevPane) {
          const prevChildren = await this.getSlotChildren(prevPane);
          candidateUris = prevChildren
            .map((item) => (item instanceof vscode.Uri ? item : item?.uri))
            .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
        }
      }
    }

    const items: ProblemItem[] = [];
    for (const uri of candidateUris) {
      const diags = vscode.languages.getDiagnostics(uri);
      for (const d of diags) {
        items.push(this.createProblemItem(uri, d));
      }
    }
    return this.sortProblems(items, config.sort);
  }

  public createProblemItem(uri: vscode.Uri, d: vscode.Diagnostic): ProblemItem {
    const relPath = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(uri) : uri.fsPath;
    const lineNum = d.range.start.line + 1;
    let icon = new vscode.ThemeIcon('info');
    if (d.severity === vscode.DiagnosticSeverity.Error) {
      icon = new vscode.ThemeIcon('error');
    } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
      icon = new vscode.ThemeIcon('warning');
    }

    return {
      type: 'problem',
      label: d.message,
      message: d.message,
      description: `${relPath}:${lineNum}`,
      tooltip: `[${vscode.DiagnosticSeverity[d.severity]}] ${d.message} (${relPath}:${lineNum})`,
      severity: d.severity,
      uri,
      range: d.range,
      iconPath: icon
    };
  }

  private sortProblems(items: ProblemItem[], sort: SortOption): ProblemItem[] {
    return items.sort((a, b) => {
      if (sort === 'category') {
        const sevDiff = a.severity - b.severity;
        if (sevDiff !== 0) {
          return sevDiff;
        }
      }
      if (sort === 'name') {
        const msgDiff = a.message.localeCompare(b.message);
        if (msgDiff !== 0) {
          return msgDiff;
        }
      }
      const uriDiff = a.uri.fsPath.localeCompare(b.uri.fsPath);
      if (uriDiff !== 0) {
        return uriDiff;
      }
      return (a.range.start.line - b.range.start.line) || (a.range.start.character - b.range.start.character);
    });
  }

  private async getChangeChildren(config: PaneConfig): Promise<vscode.Uri[]> {
    const dirtyDocs = (vscode.workspace.textDocuments || [])
      .filter((d) => d.isDirty && d.uri.scheme === 'file')
      .map((d) => d.uri);

    const changedUris = new Map<string, vscode.Uri>();
    for (const u of dirtyDocs) {
      changedUris.set(u.fsPath, u);
    }

    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt) {
        const git = (gitExt.exports as any)?.getAPI ? (gitExt.exports as any).getAPI(1) : undefined;
        if (git && git.repositories) {
          for (const repo of git.repositories) {
            const changes = [
              ...(repo.state?.workingTreeChanges || []),
              ...(repo.state?.indexChanges || [])
            ];
            for (const ch of changes) {
              if (ch.uri) {
                changedUris.set(ch.uri.fsPath, ch.uri);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    let files = Array.from(changedUris.values());

    if (config.inputSource === 'activeEditor') {
      const activeUri = this.currentEditor?.document.uri;
      files = activeUri && changedUris.has(activeUri.fsPath) ? [activeUri] : [];
    } else if (config.inputSource === 'openEditors') {
      const openUris = new Set(this.getOpenEditorUris().map((u) => u.fsPath));
      files = files.filter((u) => openUris.has(u.fsPath));
    } else if (config.inputSource === 'previousPane') {
      const prevSel = this.getPreviousPaneSelection(config.id);
      const prevPaths = new Set(
        prevSel.map((i) => (i instanceof vscode.Uri ? i.fsPath : i?.uri?.fsPath)).filter(Boolean)
      );
      files = files.filter((u) => prevPaths.has(u.fsPath));
    }

    files.sort((a, b) => {
      if (config.sort === 'name') {
        const nameA = a.path.split('/').pop() || '';
        const nameB = b.path.split('/').pop() || '';
        return nameA.localeCompare(nameB) || a.fsPath.localeCompare(b.fsPath);
      }
      return a.fsPath.localeCompare(b.fsPath);
    });

    return files;
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
    if (element && element.type === 'directory') {
      const dir = element as DirectoryNode;
      const hasChildren = Boolean(dir.children && dir.children.length > 0);
      const isHierarchy = 'display' in config && config.display === 'hierarchy';
      const item = new vscode.TreeItem(
        dir.name,
        isHierarchy && hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
      );
      if (!isHierarchy && dir.relativePath) {
        item.description = dir.relativePath;
      }
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    }

    if (element && element.type === 'problem') {
      const prob = element as ProblemItem;
      const item = new vscode.TreeItem(prob.label, vscode.TreeItemCollapsibleState.None);
      item.description = prob.description;
      item.tooltip = prob.tooltip;
      item.iconPath = prob.iconPath;
      item.command = {
        command: 'facet.revealRange',
        title: 'Reveal Problem',
        arguments: [prob.uri, prob.range]
      };
      return item;
    }

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

    if (element && 'uri' in element && 'range' in element && 'label' in element && !('kind' in element && 'category' in element)) {
      return this.relationsProvider.getTreeItem(element);
    }

    const node = element as FacetSymbolNode;
    const isTypeRole = config.role === 'types' || config.role === 'hierarchy';
    let hasChildren = false;

    if ('display' in config && config.display === 'hierarchy') {
      if (isTypeRole) {
        const filters = 'filters' in config ? config.filters : undefined;
        hasChildren = Boolean(
          node.subTypes &&
            node.subTypes.some((c) => isTypeKind(c.kind) && matchesPaneFilters(c, filters))
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
