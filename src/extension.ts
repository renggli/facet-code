import * as vscode from 'vscode';
import { SymbolResolver } from './services/symbolResolver';
import { RelationsTreeProvider } from './providers/relationsTreeProvider';
import { SlotTreeProvider } from './providers/slotTreeProvider';
import { FacetCoordinator } from './coordinator/facetCoordinator';
import { PanePipelineManager } from './coordinator/panePipelineManager';
import { WorkbenchLayoutWatcher } from './coordinator/workbenchLayoutWatcher';

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

  // Helper to focus on a pane slot
  const focusPane = async (slotId: string) => {
    try {
      await vscode.commands.executeCommand(`${slotId}.focus`);
    } catch {
      // fallback
    }
  };

  // Helper to extract slot ID from context or prompt
  const resolveSlotId = async (arg?: any, placeHolder = 'Select pane'): Promise<string | undefined> => {
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
      { placeHolder }
    );
    return picked?.id;
  };

  // 4. Register Native Pane Pipeline Commands
  for (let i = 1; i <= 6; i++) {
    const slotId = `facet.pane.${i}`;
    context.subscriptions.push(
      vscode.commands.registerCommand(`${slotId}.configure`, async () => {
        await pipelineManager.configurePane(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.display`, async () => {
        await pipelineManager.configureDisplayMode(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.filter`, async () => {
        await pipelineManager.configureFilter(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.type`, async () => {
        await pipelineManager.configurePaneType(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.input`, async () => {
        await pipelineManager.configureInputSource(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.sort`, async () => {
        await pipelineManager.configureSort(slotId);
      })
    );
  }

  // Dynamic commands for current active panes (based on current order and configuration)
  let dynamicPaneDisposables: vscode.Disposable[] = [];
  const updateDynamicPaneCommands = () => {
    for (const d of dynamicPaneDisposables) {
      d.dispose();
    }
    dynamicPaneDisposables = [];

    const visiblePanes = pipelineManager.getVisiblePanes();
    const slugCounts = new Map<string, number>();

    for (let idx = 0; idx < visiblePanes.length; idx++) {
      const pane = visiblePanes[idx];
      const baseSlug = (pane.title || pane.role).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `pane-${idx + 1}`;
      const count = (slugCounts.get(baseSlug) || 0) + 1;
      slugCounts.set(baseSlug, count);

      const slotId = pane.id;
      const targetSlug = count === 1 ? baseSlug : `${baseSlug}-${count}`;

      try {
        dynamicPaneDisposables.push(
          vscode.commands.registerCommand(`facet.focus.${targetSlug}`, async () => {
            await focusPane(slotId);
          }),
          vscode.commands.registerCommand(`facet.configure.${targetSlug}`, async () => {
            await pipelineManager.configurePane(slotId);
          })
        );
      } catch {
        // ignore duplicate
      }
    }
  };

  context.subscriptions.push(
    pipelineManager.onDidUpdatePanes(() => {
      updateDynamicPaneCommands();
    }),
    {
      dispose: () => {
        for (const d of dynamicPaneDisposables) {
          d.dispose();
        }
        dynamicPaneDisposables = [];
      }
    }
  );
  updateDynamicPaneCommands();

  context.subscriptions.push(
    vscode.commands.registerCommand('facet.addPane', async () => {
      await pipelineManager.promptAddPane();
    }),
    vscode.commands.registerCommand('facet.removePane', async () => {
      await pipelineManager.promptRemovePane();
    }),
    vscode.commands.registerCommand('facet.applyPreset', async () => {
      await pipelineManager.applyPreset();
    }),
    vscode.commands.registerCommand('facet.savePreset', async () => {
      await pipelineManager.saveCustomPresetPrompt();
    }),
    vscode.commands.registerCommand('facet.loadPreset', async () => {
      await pipelineManager.loadCustomPresetPrompt();
    }),
    vscode.commands.registerCommand('facet.deletePreset', async () => {
      await pipelineManager.deleteCustomPresetPrompt();
    }),
    vscode.commands.registerCommand('facet.pane.focus', async (arg?: any) => {
      const slotId = await resolveSlotId(arg, 'Select pane to focus');
      if (slotId) {
        await focusPane(slotId);
      }
    }),
    vscode.commands.registerCommand('facet.pane.configure', async (arg?: any) => {
      const slotId = await resolveSlotId(arg, 'Select pane to configure');
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

  // 5. Watch workbench layout for drag-and-drop reordering
  const layoutWatcher = new WorkbenchLayoutWatcher(
    context.storageUri,
    context.globalStorageUri,
    (newSlotOrder) => {
      void pipelineManager.reorderSlots(newSlotOrder);
    }
  );
  context.subscriptions.push(layoutWatcher);

  if (vscode.window.onDidChangeWindowState) {
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          layoutWatcher.checkOrder();
        }
      })
    );
  }

  context.subscriptions.push(coordinator);

  // Initial load
  if (vscode.window.activeTextEditor) {
    coordinator.handleEditorChange(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}
