import * as path from 'path';
import * as vscode from 'vscode';
import { FacetCoordinator, type FacetSlotItem } from './coordinator/facetCoordinator';
import { PanePipelineManager } from './coordinator/panePipelineManager';
import { WorkbenchLayoutWatcher } from './coordinator/workbenchLayoutWatcher';
import { RelationsTreeProvider } from './providers/relationsTreeProvider';
import { SlotTreeProvider } from './providers/slotTreeProvider';
import { SymbolResolver } from './services/symbolResolver';

export function activate(context: vscode.ExtensionContext) {
  const resolver = new SymbolResolver();
  const relationsProvider = new RelationsTreeProvider();

  const coordinator = new FacetCoordinator(resolver, relationsProvider);

  const pipelineManager = new PanePipelineManager(coordinator);

  // 1. Register 6 Dynamic Native Pane Slots
  const slotViews = new Map<string, vscode.TreeView<FacetSlotItem>>();
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

  let lastActiveSlotId: string | undefined = 'facet.pane.1';

  for (let i = 1; i <= 6; i++) {
    const slotId = `facet.pane.${i}`;
    const slotProvider = new SlotTreeProvider(slotId, coordinator);
    slotProviders.set(slotId, slotProvider);

    const treeView = vscode.window.createTreeView<FacetSlotItem>(slotId, {
      treeDataProvider: slotProvider,
      canSelectMany: true,
      showCollapseAll: true,
    });
    const pane = pipelineManager.getPane(slotId);
    if (pane) {
      treeView.title = pane.title;
    }
    slotViews.set(slotId, treeView);

    context.subscriptions.push(
      treeView.onDidChangeSelection((e) => {
        lastActiveSlotId = slotId;
        void coordinator.handleSlotSelection(slotId, e.selection);
      }),
      treeView,
    );
  }

  // 2. Wire Coordinator & Pipeline Events
  context.subscriptions.push(
    coordinator.onDidRefreshSlot((slotId) => {
      slotProviders.get(slotId)?.refresh();
    }),
    coordinator.onDidRefreshAll(() => {
      updateTitlesAndRefresh();
    }),
    coordinator.onRevealInView(({ slotId, node }) => {
      const view = slotViews.get(slotId);
      if (view && view.visible) {
        void view.reveal(node, { select: true, focus: false, expand: true });
      }
    }),
    pipelineManager.onDidUpdatePanes(() => {
      updateTitlesAndRefresh();
    }),
  );

  // 3. Register Global VS Code Event Handlers
  const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(
    fsWatcher,
    fsWatcher.onDidCreate(() => coordinator.handleFileSystemChange()),
    fsWatcher.onDidDelete(() => coordinator.handleFileSystemChange()),
    fsWatcher.onDidChange(() => coordinator.handleFileSystemChange()),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      coordinator.handleEditorChange(editor);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      coordinator.scheduleSelectionChange(e.textEditor);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      coordinator.handleDocumentChange(e.document);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      coordinator.handleDocumentChange(doc);
    }),
    vscode.languages.onDidChangeDiagnostics((e) => {
      coordinator.handleDiagnosticsChange(e.uris);
    }),
  );

  if (vscode.workspace.onDidCreateFiles) {
    context.subscriptions.push(vscode.workspace.onDidCreateFiles(() => coordinator.handleFileSystemChange()));
  }
  if (vscode.workspace.onDidDeleteFiles) {
    context.subscriptions.push(vscode.workspace.onDidDeleteFiles(() => coordinator.handleFileSystemChange()));
  }
  if (vscode.workspace.onDidRenameFiles) {
    context.subscriptions.push(vscode.workspace.onDidRenameFiles(() => coordinator.handleFileSystemChange()));
  }

  const focusPane = async (slotId: string): Promise<void> => {
    try {
      await vscode.commands.executeCommand(`${slotId}.focus`);
    } catch {
      // fallback
    }
  };

  // Helper to extract slot ID from context or prompt
  const resolveSlotId = async (arg?: unknown, placeHolder = 'Select pane'): Promise<string | undefined> => {
    if (typeof arg === 'string' && arg.startsWith('facet.pane.')) {
      return arg;
    }
    if (arg && typeof arg === 'object' && 'viewId' in arg && typeof (arg as { viewId: unknown }).viewId === 'string') {
      return (arg as { viewId: string }).viewId;
    }

    const visiblePanes = pipelineManager.getVisiblePanes();
    const picked = await vscode.window.showQuickPick(
      visiblePanes.map((p) => ({
        label: p.title,
        description: `Role: ${p.role}`,
        id: p.id,
      })),
      { placeHolder },
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
      vscode.commands.registerCommand(`${slotId}.toggleTree`, async () => {
        await pipelineManager.toggleTreeDisplay(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.toggleTree.on`, async () => {
        await pipelineManager.toggleTreeDisplay(slotId);
      }),
      vscode.commands.registerCommand(`${slotId}.toggleTree.off`, async () => {
        await pipelineManager.toggleTreeDisplay(slotId);
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
      }),
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
      const rawSlug = (pane.title ? pane.title : pane.role)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const baseSlug = rawSlug ? rawSlug : `pane-${idx + 1}`;
      const count = (slugCounts.get(baseSlug) ?? 0) + 1;
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
          }),
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
      },
    },
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
    vscode.commands.registerCommand('facet.pane.focus', async (arg?: unknown) => {
      const slotId = await resolveSlotId(arg, 'Select pane to focus');
      if (slotId) {
        await focusPane(slotId);
      }
    }),
    vscode.commands.registerCommand('facet.pane.configure', async (arg?: unknown) => {
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
    }),
    vscode.commands.registerCommand('facet.focus', async () => {
      const visible = pipelineManager.getVisiblePanes();
      const targetSlot =
        lastActiveSlotId && visible.some((p) => p.id === lastActiveSlotId)
          ? lastActiveSlotId
          : (visible[0]?.id ?? 'facet.pane.1');
      await focusPane(targetSlot);
    }),
    vscode.commands.registerCommand('facet.syncCursorAndFocus', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        await vscode.commands.executeCommand('facet.focus');
        return;
      }
      const targetSlot = await coordinator.handleSelectionChange(editor, { force: true });
      if (targetSlot) {
        lastActiveSlotId = targetSlot;
        await focusPane(targetSlot);
      } else {
        await vscode.commands.executeCommand('facet.focus');
      }
    }),
  );

  // 5. Register Standard Context Menu Commands
  let compareUri: vscode.Uri | undefined;

  const runSymbolCommand = async (arg: unknown, commandId: string) => {
    const { uri, range } = extractItemTarget(arg);
    if (uri) {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { selection: range });
      await vscode.commands.executeCommand(commandId);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('facet.openToSide', async (arg?: unknown) => {
      const { uri, range } = extractItemTarget(arg);
      if (uri) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.Beside,
          selection: range,
        });
      }
    }),
    vscode.commands.registerCommand('facet.revealInOS', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
    }),
    vscode.commands.registerCommand('facet.revealInSidebar', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        await vscode.commands.executeCommand('revealInExplorer', uri);
      }
    }),
    vscode.commands.registerCommand('facet.openInTerminal', async (arg?: unknown) => {
      const { uri, isDirectory } = extractItemTarget(arg);
      if (uri) {
        const targetDir = isDirectory ? uri : vscode.Uri.file(path.dirname(uri.fsPath));
        await vscode.commands.executeCommand('openInTerminal', targetDir);
      }
    }),
    vscode.commands.registerCommand('facet.copyPath', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        await vscode.env.clipboard.writeText(uri.fsPath);
      }
    }),
    vscode.commands.registerCommand('facet.copyRelativePath', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        await vscode.env.clipboard.writeText(vscode.workspace.asRelativePath(uri));
      }
    }),
    vscode.commands.registerCommand('facet.findInFolder', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        const rel = vscode.workspace.asRelativePath(uri);
        await vscode.commands.executeCommand('workbench.action.findInFiles', {
          filesToInclude: rel ? `./${rel}` : '',
        });
      }
    }),
    vscode.commands.registerCommand('facet.newFile', async (arg?: unknown) => {
      const { uri, isDirectory } = extractItemTarget(arg);
      if (uri) {
        const baseDir = isDirectory ? uri : vscode.Uri.file(path.dirname(uri.fsPath));
        const fileName = await vscode.window.showInputBox({ prompt: 'Enter file name' });
        if (fileName && fileName.trim()) {
          const fileUri = vscode.Uri.joinPath(baseDir, fileName.trim());
          await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
          const doc = await vscode.workspace.openTextDocument(fileUri);
          await vscode.window.showTextDocument(doc);
        }
      }
    }),
    vscode.commands.registerCommand('facet.newFolder', async (arg?: unknown) => {
      const { uri, isDirectory } = extractItemTarget(arg);
      if (uri) {
        const baseDir = isDirectory ? uri : vscode.Uri.file(path.dirname(uri.fsPath));
        const folderName = await vscode.window.showInputBox({ prompt: 'Enter folder name' });
        if (folderName && folderName.trim()) {
          const folderUri = vscode.Uri.joinPath(baseDir, folderName.trim());
          await vscode.workspace.fs.createDirectory(folderUri);
        }
      }
    }),
    vscode.commands.registerCommand('facet.deleteFile', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        const name = path.basename(uri.fsPath);
        const choice = await vscode.window.showWarningMessage(
          `Are you sure you want to delete '${name}'?`,
          { modal: true },
          'Delete',
        );
        if (choice === 'Delete') {
          await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: true });
        }
      }
    }),
    vscode.commands.registerCommand('facet.renameFile', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        const oldName = path.basename(uri.fsPath);
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new name',
          value: oldName,
        });
        if (newName && newName.trim() && newName.trim() !== oldName) {
          const parentDir = vscode.Uri.file(path.dirname(uri.fsPath));
          const targetUri = vscode.Uri.joinPath(parentDir, newName.trim());
          await vscode.workspace.fs.rename(uri, targetUri);
        }
      }
    }),
    vscode.commands.registerCommand('facet.selectForCompare', (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri) {
        compareUri = uri;
      }
    }),
    vscode.commands.registerCommand('facet.compareWithSelected', async (arg?: unknown) => {
      const { uri } = extractItemTarget(arg);
      if (uri && compareUri) {
        const title = `${path.basename(compareUri.fsPath)} ↔ ${path.basename(uri.fsPath)}`;
        await vscode.commands.executeCommand('vscode.diff', compareUri, uri, title);
      }
    }),
    vscode.commands.registerCommand('facet.symbol.goToDefinition', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.revealDefinition'),
    ),
    vscode.commands.registerCommand('facet.symbol.peekDefinition', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.peekDefinition'),
    ),
    vscode.commands.registerCommand('facet.symbol.goToDeclaration', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.revealDeclaration'),
    ),
    vscode.commands.registerCommand('facet.symbol.goToTypeDefinition', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.goToTypeDefinition'),
    ),
    vscode.commands.registerCommand('facet.symbol.goToImplementations', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.goToImplementation'),
    ),
    vscode.commands.registerCommand('facet.symbol.peekImplementations', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.peekImplementation'),
    ),
    vscode.commands.registerCommand('facet.symbol.findReferences', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.referenceSearch.trigger'),
    ),
    vscode.commands.registerCommand('facet.symbol.showCallHierarchy', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.showCallHierarchy'),
    ),
    vscode.commands.registerCommand('facet.symbol.showTypeHierarchy', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.showTypeHierarchy'),
    ),
    vscode.commands.registerCommand('facet.symbol.rename', (arg?: unknown) =>
      runSymbolCommand(arg, 'editor.action.rename'),
    ),
    vscode.commands.registerCommand('facet.symbol.copyName', async (arg?: unknown) => {
      const { name } = extractItemTarget(arg);
      if (name) {
        await vscode.env.clipboard.writeText(name);
      }
    }),
    vscode.commands.registerCommand('facet.problem.copyMessage', async (arg?: unknown) => {
      const { message } = extractItemTarget(arg);
      if (message) {
        await vscode.env.clipboard.writeText(message);
      }
    }),
  );

  // 6. Watch workbench layout for drag-and-drop reordering
  const layoutWatcher = new WorkbenchLayoutWatcher(context.storageUri, context.globalStorageUri, (newSlotOrder) => {
    void pipelineManager.reorderSlots(newSlotOrder);
  });
  context.subscriptions.push(layoutWatcher);

  if (vscode.window.onDidChangeWindowState) {
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          layoutWatcher.checkOrder();
        }
      }),
    );
  }

  context.subscriptions.push(coordinator);

  // Initial load
  if (vscode.window.activeTextEditor) {
    coordinator.handleEditorChange(vscode.window.activeTextEditor);
  }
}

export function deactivate() {}

interface ItemTarget {
  uri?: vscode.Uri;
  range?: vscode.Range;
  name?: string;
  message?: string;
  isDirectory?: boolean;
}

function extractItemTarget(arg: unknown): ItemTarget {
  if (arg instanceof vscode.Uri) {
    return { uri: arg };
  }
  if (!arg || typeof arg !== 'object') {
    return {};
  }
  const item = arg as Record<string, unknown>;
  const uri = item.uri instanceof vscode.Uri ? item.uri : undefined;
  const isDirectory = item.type === 'directory';
  const range =
    item.selectionRange instanceof vscode.Range
      ? item.selectionRange
      : item.range instanceof vscode.Range
        ? item.range
        : undefined;
  const name = typeof item.name === 'string' ? item.name : undefined;
  const message = typeof item.message === 'string' ? item.message : undefined;
  return { uri, range, name, message, isDirectory };
}
