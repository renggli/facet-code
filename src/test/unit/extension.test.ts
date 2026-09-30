import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { activate, deactivate, getAllPaneItems } from '../../extension';
import { type PaneConfig, PaneInputSource, PaneRole, SortOption } from '../../models/paneConfig';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';

suite('Extension Lifecycle Test Suite', () => {
  test('activate registers tree views and commands without throwing', () => {
    const subscriptions: vscode.Disposable[] = [];
    const context: vscode.ExtensionContext = {
      subscriptions,
      workspaceState: {} as any,
      globalState: {} as any,
      extensionUri: vscode.Uri.file('/fake/path'),
      extensionPath: '/fake/path',
      environmentVariableCollection: {} as any,
      asAbsolutePath: (rel: string) => rel,
      storageUri: undefined,
      storagePath: undefined,
      globalStorageUri: vscode.Uri.file('/fake/global'),
      globalStoragePath: '/fake/global',
      logUri: vscode.Uri.file('/fake/log'),
      logPath: '/fake/log',
      extensionMode: vscode.ExtensionMode.Test,
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any,
    };

    assert.doesNotThrow(() => {
      activate(context);
    });

    assert.ok(subscriptions.length > 0);
  });

  test('registered commands execute without throwing', async () => {
    assert.doesNotThrow(() => {
      deactivate();
    });

    // Execute configured slot command
    await vscode.commands.executeCommand('facet.pane.1.configure');

    // Execute presets command
    await vscode.commands.executeCommand('facet.pane.presets');

    // Execute revealRange command
    const dummyUri = vscode.Uri.file('/fake/test.ts');
    const dummyRange = new vscode.Range(0, 0, 0, 0);
    await vscode.commands.executeCommand('facet.revealRange', dummyUri, dummyRange);

    // Execute generic configure command with arg
    await vscode.commands.executeCommand('facet.pane.configure', 'facet.pane.2');
    await vscode.commands.executeCommand('facet.pane.configure', { viewId: 'facet.pane.3' });

    // Execute generic focus command with arg
    await vscode.commands.executeCommand('facet.pane.focus', 'facet.pane.1');
    await vscode.commands.executeCommand('facet.pane.focus', { viewId: 'facet.pane.2' });

    // Execute generic configure & focus with QuickPick fallback (no arg)
    const window = vscode.window as any;
    window.pushQuickPick({ id: 'facet.pane.1', label: 'Directories' });
    await vscode.commands.executeCommand('facet.pane.focus');

    window.pushQuickPick({ id: 'facet.pane.2', label: 'Files' });
    await vscode.commands.executeCommand('facet.pane.configure');

    // Execute dynamic title/pane focus & configure commands
    await vscode.commands.executeCommand('facet.focus.directories');
    await vscode.commands.executeCommand('facet.configure.directories');
    await vscode.commands.executeCommand('facet.focus.files');
    await vscode.commands.executeCommand('facet.configure.files');
    await vscode.commands.executeCommand('facet.focus.definitions');
    await vscode.commands.executeCommand('facet.focus.members');

    // Execute slot-specific action commands
    await vscode.commands.executeCommand('facet.pane.1.toggleTree');
    await vscode.commands.executeCommand('facet.pane.1.toggleTree.on');
    await vscode.commands.executeCommand('facet.pane.1.toggleTree.off');
    await vscode.commands.executeCommand('facet.pane.1.filter');
    await vscode.commands.executeCommand('facet.pane.1.type');
    await vscode.commands.executeCommand('facet.pane.1.input');
    await vscode.commands.executeCommand('facet.pane.1.sort');

    // Execute global palette commands
    await vscode.commands.executeCommand('facet.focus');
    await vscode.commands.executeCommand('facet.syncCursorAndFocus');
    await vscode.commands.executeCommand('facet.selectAtCursorAndFocus');
    await vscode.commands.executeCommand('facet.toggleSelectAll');
    await vscode.commands.executeCommand('facet.toggleSelectAll', 'facet.pane.1');
    await vscode.commands.executeCommand('facet.toggleSelectAll', { viewId: 'facet.pane.2' });
    await vscode.commands.executeCommand('facet.addPane');
    await vscode.commands.executeCommand('facet.removePane');
    await vscode.commands.executeCommand('facet.applyPreset');
    await vscode.commands.executeCommand('facet.savePreset');
    await vscode.commands.executeCommand('facet.loadPreset');
    await vscode.commands.executeCommand('facet.deletePreset');

    // Execute context menu commands with various item types
    const fileArg = vscode.Uri.file('/fake/test.ts');
    await vscode.commands.executeCommand('facet.openToSide', fileArg);
    await vscode.commands.executeCommand('facet.revealInOS', fileArg);
    await vscode.commands.executeCommand('facet.revealInSidebar', fileArg);
    await vscode.commands.executeCommand('facet.openInTerminal', fileArg);
    await vscode.commands.executeCommand('facet.copyPath', fileArg);
    await vscode.commands.executeCommand('facet.copyRelativePath', fileArg);
    await vscode.commands.executeCommand('facet.findInFolder', fileArg);
    await vscode.commands.executeCommand('facet.selectForCompare', fileArg);
    await vscode.commands.executeCommand('facet.compareWithSelected', fileArg);

    // Test prompt-based file actions with cancelled input
    await vscode.commands.executeCommand('facet.newFile', fileArg);
    await vscode.commands.executeCommand('facet.newFolder', fileArg);
    await vscode.commands.executeCommand('facet.deleteFile', fileArg);
    await vscode.commands.executeCommand('facet.renameFile', fileArg);

    // Symbol context commands
    const symbolArg = {
      name: 'testSym',
      uri: fileArg,
      range: dummyRange,
      selectionRange: dummyRange,
    };
    await vscode.commands.executeCommand('facet.symbol.goToDefinition', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.peekDefinition', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.goToDeclaration', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.goToTypeDefinition', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.goToImplementations', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.peekImplementations', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.findReferences', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.showCallHierarchy', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.showTypeHierarchy', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.rename', symbolArg);
    await vscode.commands.executeCommand('facet.symbol.copyName', symbolArg);

    // Problem context commands
    const problemArg = {
      uri: fileArg,
      message: 'test error',
      type: 'problem',
    };
    await vscode.commands.executeCommand('facet.problem.copyMessage', problemArg);
  });

  test('getAllPaneItems returns flat list of all nodes across tree and flat panes', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    new PanePipelineManager(coordinator);

    const filesConfig: PaneConfig = {
      id: 'facet.pane.2',
      role: PaneRole.Files,
      title: 'Files',
      visible: true,
      inputSource: PaneInputSource.Project,
      sort: SortOption.Name,
      tree: false,
    };

    coordinator.setCachedWorkspaceFiles([vscode.Uri.file('/workspace/a.ts'), vscode.Uri.file('/workspace/b.ts')]);

    const flatItems = await getAllPaneItems(coordinator, filesConfig);
    assert.strictEqual(flatItems.length, 2);

    const dirConfig: PaneConfig = {
      id: 'facet.pane.1',
      role: PaneRole.Directories,
      title: 'Directories',
      visible: true,
      inputSource: PaneInputSource.Project,
      sort: SortOption.Name,
      tree: true,
    };

    coordinator.setCachedWorkspaceFiles([
      vscode.Uri.file('/workspace/src/app/index.ts'),
      vscode.Uri.file('/workspace/src/utils/math.ts'),
    ]);

    const treeItems = await getAllPaneItems(coordinator, dirConfig);
    assert.ok(treeItems.length >= 2);

    coordinator.dispose();
  });
});
