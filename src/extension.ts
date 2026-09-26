import * as vscode from 'vscode';
import { SymbolResolver } from './services/symbolResolver';
import { RelationsTreeProvider } from './providers/relationsTreeProvider';
import { SlotTreeProvider } from './providers/slotTreeProvider';
import { FacetCoordinator } from './coordinator/facetCoordinator';
import { PanePipelineManager } from './coordinator/panePipelineManager';

export function activate(context: vscode.ExtensionContext) {
  const resolver = new SymbolResolver();
  const relationsProvider = new RelationsTreeProvider();

  const coordinator = new FacetCoordinator(
    resolver,
    relationsProvider
  );

  const pipelineManager = new PanePipelineManager(coordinator);

  // 1. Register 6 Dynamic Native Pane Slots
  const slotViews = new Map<string, vscode.TreeView<any>>();
  const slotProviders = new Map<string, SlotTreeProvider>();

  const updateTitlesAndRefresh = () => {
    for (let i = 1; i <= 6; i++) {
      const slotId = `facet.pane.${i}`;
      const pane = pipelineManager.getPane(slotId);
      const view = slotViews.get(slotId);
      if (view && pane) {
        view.title = pane.title;
      }
      slotProviders.get(slotId)?.refresh();
    }
  };

  for (let i = 1; i <= 6; i++) {
    const slotId = `facet.pane.${i}`;
    const slotProvider = new SlotTreeProvider(slotId, coordinator);
    slotProviders.set(slotId, slotProvider);

    const treeView = vscode.window.createTreeView(slotId, {
      treeDataProvider: slotProvider,
      canSelectMany: true,
      showCollapseAll: true
    });
    const pane = pipelineManager.getPane(slotId);
    if (pane) {
      treeView.title = pane.title;
    }
    slotViews.set(slotId, treeView);

    context.subscriptions.push(
      treeView.onDidChangeSelection((e) => {
        void coordinator.handleSlotSelection(slotId, e.selection);
      }),
      treeView
    );
  }

  // 2. Wire Coordinator & Pipeline Events
  context.subscriptions.push(
    coordinator.onDidRefreshSlot((id) => {
      slotProviders.get(id)?.refresh();
    }),
    coordinator.onDidRefreshAll(() => {
      for (const sp of slotProviders.values()) {
        sp.refresh();
      }
    }),
    coordinator.onRevealInView(({ slotId, node }) => {
      void slotViews.get(slotId)?.reveal(node, { select: true, focus: false });
    }),
    pipelineManager.onDidUpdatePanes(() => {
      updateTitlesAndRefresh();
    })
  );

  // 3. Track Editor Lifecycle with Debounce
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
      visiblePanes.map((p) => ({
        label: p.title,
        description: `Role: ${p.role}`,
        id: p.id
      })),
      { placeHolder: 'Select pane' }
    );
    return picked?.id;
  };

  // 4. Register Native Pane Pipeline Commands
  for (let i = 1; i <= 6; i++) {
    const slotId = `facet.pane.${i}`;
    context.subscriptions.push(
      vscode.commands.registerCommand(`${slotId}.configure`, async () => {
        await pipelineManager.configurePane(slotId);
      })
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('facet.pane.configure', async (arg?: any) => {
      const slotId = await resolveSlotId(arg);
      if (slotId) {
        await pipelineManager.configurePane(slotId);
      }
    }),
    vscode.commands.registerCommand('facet.pane.presets', async () => {
      await pipelineManager.applyPreset();
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
