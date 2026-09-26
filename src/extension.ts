import * as vscode from 'vscode';
import { SymbolResolver } from './services/symbolResolver';
import { TypesTreeProvider } from './providers/typesTreeProvider';
import { CategoriesTreeProvider } from './providers/categoriesTreeProvider';
import { MembersTreeProvider } from './providers/membersTreeProvider';
import { RelationsTreeProvider, RelationsMode } from './providers/relationsTreeProvider';
import { SlotTreeProvider } from './providers/slotTreeProvider';
import { FacetCoordinator } from './coordinator/facetCoordinator';
import { PanePipelineManager } from './coordinator/panePipelineManager';
import { MemberCategory } from './models/symbolNode';

export function activate(context: vscode.ExtensionContext) {
  const resolver = new SymbolResolver();
  const typesProvider = new TypesTreeProvider();
  const categoriesProvider = new CategoriesTreeProvider();
  const membersProvider = new MembersTreeProvider();
  const relationsProvider = new RelationsTreeProvider();

  const coordinator = new FacetCoordinator(
    resolver,
    typesProvider,
    categoriesProvider,
    membersProvider,
    relationsProvider
  );

  const pipelineManager = new PanePipelineManager(coordinator);

  // 1. Register 6 Dynamic Native Pane Slots
  const slotViews = new Map<string, vscode.TreeView<any>>();
  const slotProviders = new Map<string, SlotTreeProvider>();

  for (const pane of pipelineManager.getPanes()) {
    const slotProvider = new SlotTreeProvider(
      pane,
      typesProvider,
      categoriesProvider,
      membersProvider,
      relationsProvider
    );
    slotProviders.set(pane.id, slotProvider);

    const treeView = vscode.window.createTreeView(pane.id, {
      treeDataProvider: slotProvider,
      canSelectMany: true,
      showCollapseAll: true
    });
    treeView.title = pane.title;
    slotViews.set(pane.id, treeView);

    context.subscriptions.push(
      treeView.onDidChangeSelection((e) => {
        if (pane.role === 'types') {
          void coordinator.selectTypes(e.selection);
        } else if (pane.role === 'members') {
          coordinator.selectMembers(e.selection);
        }
      }),
      treeView
    );
  }

  // 2. Track Editor Lifecycle with Debounce
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      coordinator.handleEditorChange(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      coordinator.handleSelectionChange(e.textEditor);
    })
  );

  // Helper to extract slot ID from context or prompt
  const resolveSlotId = async (arg?: any): Promise<string | undefined> => {
    if (typeof arg === 'string' && arg.startsWith('facet.pane.')) {
      return arg;
    }
    if (arg && typeof arg.viewId === 'string') {
      return arg.viewId;
    }

    const visiblePanes = pipelineManager.getVisiblePanes();
    const picked = await vscode.window.showQuickPick(
      visiblePanes.map((p) => ({ label: p.title, description: `Role: ${p.role}`, id: p.id })),
      { placeHolder: 'Select pane' }
    );
    return picked?.id;
  };

  // 3. Register Native Pane Pipeline Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('facet.pane.add', async () => {
      const added = await pipelineManager.addPane();
      if (added) {
        const view = slotViews.get(added.id);
        if (view) {
          view.title = added.title;
        }
      }
    }),
    vscode.commands.registerCommand('facet.pane.presets', async () => {
      await pipelineManager.applyPreset();
      for (const p of pipelineManager.getPanes()) {
        const view = slotViews.get(p.id);
        if (view) {
          view.title = p.title;
        }
        slotProviders.get(p.id)?.refresh();
      }
    }),
    vscode.commands.registerCommand('facet.pane.configure', async (arg?: any) => {
      const slotId = await resolveSlotId(arg);
      if (slotId) {
        await pipelineManager.configurePane(slotId);
        const pane = pipelineManager.getPane(slotId);
        const view = slotViews.get(slotId);
        if (pane && view) {
          view.title = pane.title;
        }
        slotProviders.get(slotId)?.refresh();
      }
    }),
    vscode.commands.registerCommand('facet.pane.remove', async (arg?: any) => {
      const slotId = await resolveSlotId(arg);
      if (slotId) {
        pipelineManager.removePane(slotId);
      }
    }),
    vscode.commands.registerCommand('facet.pane.moveUp', async (arg?: any) => {
      const slotId = await resolveSlotId(arg);
      if (slotId) {
        pipelineManager.movePane(slotId, 'up');
        for (const p of pipelineManager.getPanes()) {
          const view = slotViews.get(p.id);
          if (view) {
            view.title = p.title;
          }
          slotProviders.get(p.id)?.refresh();
        }
      }
    }),
    vscode.commands.registerCommand('facet.pane.moveDown', async (arg?: any) => {
      const slotId = await resolveSlotId(arg);
      if (slotId) {
        pipelineManager.movePane(slotId, 'down');
        for (const p of pipelineManager.getPanes()) {
          const view = slotViews.get(p.id);
          if (view) {
            view.title = p.title;
          }
          slotProviders.get(p.id)?.refresh();
        }
      }
    }),
    vscode.commands.registerCommand('facet.toggleScope', async () => {
      const scope = await coordinator.toggleScope();
      const pane1 = pipelineManager.getPane('facet.pane.1');
      if (pane1 && pane1.role === 'types') {
        pane1.title = `Types (${scope === 'file' ? 'File' : 'Project'})`;
        const view1 = slotViews.get('facet.pane.1');
        if (view1) {
          view1.title = pane1.title;
        }
      }
    }),
    vscode.commands.registerCommand('facet.toggleHierarchy', () => {
      const mode = coordinator.toggleHierarchy();
      const pane1 = pipelineManager.getPane('facet.pane.1');
      if (pane1 && pane1.role === 'types') {
        pane1.title = `Types (${mode === 'flat' ? 'Flat' : 'Inherited'})`;
        const view1 = slotViews.get('facet.pane.1');
        if (view1) {
          view1.title = pane1.title;
        }
      }
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
      }
    }),
    vscode.commands.registerCommand('facet.revealRange', (uri: vscode.Uri, range: vscode.Range) => {
      void coordinator.revealRange(uri, range);
    })
  );

  context.subscriptions.push(coordinator);

  // Initial load
  if (vscode.window.activeTextEditor) {
    coordinator.handleEditorChange(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}
