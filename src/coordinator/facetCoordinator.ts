import * as vscode from 'vscode';
import { SymbolResolver } from '../services/symbolResolver';
import { TypesTreeProvider, TypesScope } from '../providers/typesTreeProvider';
import { CategoriesTreeProvider } from '../providers/categoriesTreeProvider';
import { MembersTreeProvider } from '../providers/membersTreeProvider';
import { RelationsTreeProvider, RelationsMode } from '../providers/relationsTreeProvider';
import { FacetSymbolNode, MemberCategory, HierarchyMode, LayoutMode } from '../models/symbolNode';

export class FacetCoordinator implements vscode.Disposable {
  private cancellationSource?: vscode.CancellationTokenSource;
  private debounceTimer?: NodeJS.Timeout;
  private currentEditor?: vscode.TextEditor;

  public scope: TypesScope = 'file';
  public hierarchyMode: HierarchyMode = 'flat';
  public layoutMode: LayoutMode = 'list';

  constructor(
    public readonly resolver: SymbolResolver,
    public readonly typesProvider: TypesTreeProvider,
    public readonly categoriesProvider: CategoriesTreeProvider,
    public readonly membersProvider: MembersTreeProvider,
    public readonly relationsProvider: RelationsTreeProvider
  ) {
    this.typesProvider.scope = this.scope;
    this.membersProvider.setLayoutMode(this.layoutMode);
  }

  public handleEditorChange(editor: vscode.TextEditor | undefined): void {
    this.currentEditor = editor;
    this.scheduleSync();
  }

  public handleSelectionChange(editor: vscode.TextEditor): void {
    if (this.scope === 'file' && this.currentEditor?.document.uri.toString() === editor.document.uri.toString()) {
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
      if (this.scope === 'project') {
        const types = await this.resolver.resolveWorkspaceTypes('', token);
        if (token.isCancellationRequested) {
          return;
        }
        this.typesProvider.setTypes(types);

        if (types.length > 0) {
          await this.selectTypes([types[0]]);
        } else {
          await this.selectTypes([]);
        }
        return;
      }

      if (!this.currentEditor) {
        this.typesProvider.setSymbols([]);
        this.membersProvider.setSelectedTypes([]);
        this.categoriesProvider.setCounts({});
        this.relationsProvider.setSelectedMembers([]);
        return;
      }

      const symbols = await this.resolver.resolveDocumentSymbols(this.currentEditor.document, token);
      if (token.isCancellationRequested) {
        return;
      }

      this.typesProvider.setSymbols(symbols);

      const types = this.typesProvider.getTypes();
      if (types.length > 0) {
        await this.selectTypes([types[0]]);
      } else {
        await this.selectTypes([]);
      }
    } catch (err) {
      if (!token.isCancellationRequested) {
        console.error('Facet sync error:', err);
      }
    }
  }

  public async selectTypes(types: readonly FacetSymbolNode[]): Promise<void> {
    if (this.scope === 'project') {
      for (const t of types) {
        if (!t.children || t.children.length === 0) {
          await this.resolver.hydrateTypeNode(t);
        }
      }
    }

    this.membersProvider.setSelectedTypes(types);
    const counts = this.membersProvider.getCategoryCounts();
    this.categoriesProvider.setCounts(counts);

    const members = this.membersProvider.getFilteredMembers();
    if (members.length > 0) {
      this.selectMembers([members[0]]);
    } else {
      this.selectMembers([]);
    }
  }

  public selectCategory(category: MemberCategory): void {
    this.categoriesProvider.setSelectedCategory(category);
    this.membersProvider.setActiveCategory(category);
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

  public setRelationsMode(mode: RelationsMode): void {
    this.relationsProvider.setMode(mode);
  }

  public async revealRange(uri: vscode.Uri, range: vscode.Range): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      selection: range,
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Active
    });
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.cancellationSource) {
      this.cancellationSource.cancel();
      this.cancellationSource.dispose();
    }
  }
}
