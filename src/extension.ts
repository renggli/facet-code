import * as vscode from 'vscode';
import { SymbolResolver } from './services/symbolResolver';
import { TypesTreeProvider } from './providers/typesTreeProvider';
import { CategoriesTreeProvider } from './providers/categoriesTreeProvider';
import { MembersTreeProvider } from './providers/membersTreeProvider';
import { RelationsTreeProvider, RelationsMode } from './providers/relationsTreeProvider';
import { FacetCoordinator } from './coordinator/facetCoordinator';
import { FacetPipeline } from './pipeline/facetPipeline';
import { DeckViewProvider } from './deck/deckViewProvider';
import { MemberCategory } from './models/symbolNode';

export function activate(context: vscode.ExtensionContext) {
  const resolver = new SymbolResolver();
  const pipeline = new FacetPipeline();
  const typesProvider = new TypesTreeProvider();
  const categoriesProvider = new CategoriesTreeProvider();
  const membersProvider = new MembersTreeProvider();
  const relationsProvider = new RelationsTreeProvider();
  const deckProvider = new DeckViewProvider(context.extensionUri, pipeline, resolver);

  const coordinator = new FacetCoordinator(
    resolver,
    typesProvider,
    categoriesProvider,
    membersProvider,
    relationsProvider,
    deckProvider
  );

  // 1. Register Dynamic Webview Deck Provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DeckViewProvider.viewType, deckProvider)
  );

  // 2. Register Native Tree Views
  const typesView = vscode.window.createTreeView('facet.views.types', {
    treeDataProvider: typesProvider,
    canSelectMany: true,
    showCollapseAll: true
  });

  const categoriesView = vscode.window.createTreeView('facet.views.categories', {
    treeDataProvider: categoriesProvider,
    canSelectMany: false
  });

  const membersView = vscode.window.createTreeView('facet.views.members', {
    treeDataProvider: membersProvider,
    canSelectMany: true,
    showCollapseAll: true
  });

  const relationsView = vscode.window.createTreeView('facet.views.relations', {
    treeDataProvider: relationsProvider,
    canSelectMany: false,
    showCollapseAll: true
  });

  // 3. Wire Tree View Multi-Selection Events
  context.subscriptions.push(
    typesView.onDidChangeSelection((e) => {
      coordinator.selectTypes(e.selection);
    })
  );

  context.subscriptions.push(
    membersView.onDidChangeSelection((e) => {
      coordinator.selectMembers(e.selection);
    })
  );

  // 4. Track Editor Lifecycle with Debounce
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      coordinator.handleEditorChange(editor);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      coordinator.handleSelectionChange(e.textEditor);
    })
  );

  // 5. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('facet.pipeline.addStage', () => {
      void deckProvider.promptAddStage();
    }),
    vscode.commands.registerCommand('facet.pipeline.toggleOrientation', () => {
      pipeline.toggleOrientation();
    }),
    vscode.commands.registerCommand('facet.pipeline.switchPreset', () => {
      void deckProvider.promptSwitchPreset();
    }),
    vscode.commands.registerCommand('facet.toggleSide', () => {
      const nextSide = coordinator.toggleSide();
      membersView.title = `Members (${nextSide === 'both' ? 'All' : nextSide})`;
    }),
    vscode.commands.registerCommand('facet.toggleHierarchy', () => {
      const mode = coordinator.toggleHierarchy();
      typesView.title = `Types (${mode === 'flat' ? 'Flat' : 'Inherited'})`;
    }),
    vscode.commands.registerCommand('facet.toggleLayout', () => {
      coordinator.toggleLayout();
    }),
    vscode.commands.registerCommand('facet.selectCategory', (category: MemberCategory) => {
      coordinator.selectCategory(category);
    }),
    vscode.commands.registerCommand('facet.relations.switchMode', async () => {
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'References', description: 'All usages across workspace', mode: 'references' },
          { label: 'Callers (Senders)', description: 'Incoming call hierarchy', mode: 'callers' },
          { label: 'Implementations', description: 'Overrides and subtypes', mode: 'implementations' }
        ],
        { placeHolder: 'Select Relations Query Mode' }
      );

      if (picked) {
        coordinator.setRelationsMode(picked.mode as RelationsMode);
        relationsView.title = `Relations: ${picked.label}`;
      }
    }),
    vscode.commands.registerCommand('facet.revealRange', (uri: vscode.Uri, range: vscode.Range) => {
      void coordinator.revealRange(uri, range);
    })
  );

  context.subscriptions.push(typesView, categoriesView, membersView, relationsView, coordinator);

  // Initial load
  if (vscode.window.activeTextEditor) {
    coordinator.handleEditorChange(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}
