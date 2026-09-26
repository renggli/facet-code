import * as vscode from 'vscode';
import { SymbolResolver } from '../services/symbolResolver';
import { TypesTreeProvider } from '../providers/typesTreeProvider';
import { CategoriesTreeProvider } from '../providers/categoriesTreeProvider';
import { MembersTreeProvider } from '../providers/membersTreeProvider';
import { RelationsTreeProvider, RelationsMode } from '../providers/relationsTreeProvider';
import { FacetSymbolNode, MemberCategory, ClassSide, HierarchyMode, LayoutMode } from '../models/symbolNode';

import { DeckViewProvider } from '../deck/deckViewProvider';

export class FacetCoordinator implements vscode.Disposable {
  private cancellationSource?: vscode.CancellationTokenSource;
  private debounceTimer?: NodeJS.Timeout;
  private currentEditor?: vscode.TextEditor;

  public classSide: ClassSide = 'instance';
  public hierarchyMode: HierarchyMode = 'flat';
  public layoutMode: LayoutMode = 'list';

  constructor(
    public readonly resolver: SymbolResolver,
    public readonly typesProvider: TypesTreeProvider,
    public readonly categoriesProvider: CategoriesTreeProvider,
    public readonly membersProvider: MembersTreeProvider,
    public readonly relationsProvider: RelationsTreeProvider,
    public deckProvider?: DeckViewProvider
  ) {
    this.membersProvider.setClassSide(this.classSide);
    this.membersProvider.setLayoutMode(this.layoutMode);
  }

  public handleEditorChange(editor: vscode.TextEditor | undefined): void {
    this.currentEditor = editor;
    this.scheduleSync();
  }

  public handleSelectionChange(editor: vscode.TextEditor): void {
    if (this.currentEditor?.document.uri.toString() === editor.document.uri.toString()) {
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
    if (!this.currentEditor) {
      this.typesProvider.setSymbols([]);
      this.membersProvider.setSelectedTypes([]);
      this.categoriesProvider.setCounts({});
      this.relationsProvider.setSelectedMembers([]);
      this.deckProvider?.setSymbols([]);
      return;
    }

    this.cancellationSource = new vscode.CancellationTokenSource();
    const token = this.cancellationSource.token;

    try {
      const symbols = await this.resolver.resolveDocumentSymbols(this.currentEditor.document, token);
      if (token.isCancellationRequested) {
        return;
      }

      this.typesProvider.setSymbols(symbols);
      this.deckProvider?.setSymbols(symbols);

      const types = this.typesProvider.getTypes();
      if (types.length > 0) {
        // Auto-select first type if nothing selected yet
        this.selectTypes([types[0]]);
      } else {
        this.selectTypes([]);
      }
    } catch (err) {
      if (!token.isCancellationRequested) {
        console.error('Facet sync error:', err);
      }
    }
  }

  public selectTypes(types: readonly FacetSymbolNode[]): void {
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

  public toggleSide(): ClassSide {
    const nextSide: Record<ClassSide, ClassSide> = {
      instance: 'class',
      class: 'both',
      both: 'instance'
    };
    this.classSide = nextSide[this.classSide];
    this.membersProvider.setClassSide(this.classSide);
    return this.classSide;
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
