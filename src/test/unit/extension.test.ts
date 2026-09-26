import * as assert from 'assert';
import * as vscode from 'vscode';
import { activate, deactivate } from '../../extension';

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
      languageModelAccessInformation: {} as any
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
    await vscode.commands.executeCommand('facet.focus.types');
    await vscode.commands.executeCommand('facet.focus.members');
  });
});
