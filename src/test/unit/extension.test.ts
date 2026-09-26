import * as assert from 'assert';
import * as vscode from 'vscode';
import { activate } from '../../extension';

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
});
