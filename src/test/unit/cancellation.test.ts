import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import {
  createDefaultFilters,
  type DefinitionsPaneConfig,
  type ImplementationsPaneConfig,
  PaneInputSource,
  PaneRole,
  type ReferencesPaneConfig,
  RelationMode,
  SortOption,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';
import { type FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { CancellationTokenSource, resetMockState } from './mockVscode';

suite('Cancellation Tokens & Abort Handling Test Suite', () => {
  let resolver: SymbolResolver;
  let relationsProvider: RelationsTreeProvider;
  let coordinator: FacetCoordinator;
  let origExecuteCommand: typeof vscode.commands.executeCommand;
  let origFindFiles: typeof vscode.workspace.findFiles;

  setup(() => {
    resetMockState();
    origExecuteCommand = vscode.commands.executeCommand;
    origFindFiles = vscode.workspace.findFiles;
    resolver = new SymbolResolver();
    relationsProvider = new RelationsTreeProvider();
    coordinator = new FacetCoordinator(resolver, relationsProvider);
  });

  teardown(() => {
    vscode.commands.executeCommand = origExecuteCommand;
    vscode.workspace.findFiles = origFindFiles;
    coordinator.dispose();
    resetMockState();
  });

  suite('SymbolResolver Cancellation', () => {
    test('resolveDocumentSymbols aborts promptly when token is pre-cancelled', async () => {
      const uri = vscode.Uri.file('/workspace/src/sample.ts');
      const doc = {
        uri,
        version: 1,
        getText: () => 'export class Service { execute(): void {} }',
      };

      let commandExecuted = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          commandExecuted = true;
          return [];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const textDoc = doc as unknown as vscode.TextDocument;
      const cts = new CancellationTokenSource();
      cts.cancel();

      const result = await resolver.resolveDocumentSymbols(textDoc, cts.token);

      assert.deepStrictEqual(result, []);
      // Early check prevents unnecessary provider invocation
      assert.strictEqual(commandExecuted, false);
    });

    test('resolveDocumentSymbols caches results only when token is not cancelled', async () => {
      const uri = vscode.Uri.file('/workspace/src/caching.ts');
      const doc = {
        uri,
        version: 1,
        getText: () => 'export class CachedService { run(): void {} }',
      };
      const textDoc = doc as unknown as vscode.TextDocument;

      const ctsCancelled = new CancellationTokenSource();
      ctsCancelled.cancel();

      // First run with cancelled token
      const cancelledResult = await resolver.resolveDocumentSymbols(textDoc, ctsCancelled.token);
      assert.deepStrictEqual(cancelledResult, []);

      // Second run without cancellation - should resolve genuinely and populate cache
      const normalResult = await resolver.resolveDocumentSymbols(textDoc);
      assert.ok(normalResult.length > 0);
      assert.strictEqual(normalResult[0].name, 'CachedService');

      // Subsequent call should hit valid cache
      const cachedResult = await resolver.resolveDocumentSymbols(textDoc);
      assert.strictEqual(cachedResult, normalResult);
    });

    test('resolveWorkspaceTypes aborts when token is pre-cancelled', async () => {
      let workspaceSymbolProviderCalled = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeWorkspaceSymbolProvider') {
          workspaceSymbolProviderCalled = true;
          return [
            {
              name: 'AppModule',
              containerName: 'core',
              kind: vscode.SymbolKind.Class,
              location: {
                uri: vscode.Uri.file('/workspace/src/app.ts'),
                range: new vscode.Range(0, 0, 10, 0),
              },
            },
          ];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const result = await resolver.resolveWorkspaceTypes('', cts.token);
      assert.deepStrictEqual(result, []);
      assert.strictEqual(workspaceSymbolProviderCalled, false);
    });

    test('scanWorkspaceTypesFromFiles aborts when token is cancelled', async () => {
      const fileUris = [vscode.Uri.file('/workspace/src/a.ts'), vscode.Uri.file('/workspace/src/b.ts')];

      vscode.workspace.findFiles = async () => fileUris;

      const cts = new CancellationTokenSource();
      cts.cancel();

      const result = await resolver.scanWorkspaceTypesFromFiles(cts.token);
      assert.deepStrictEqual(result, []);
    });

    test('resolveTypeHierarchySubtypes and supertypes abort on cancelled token', async () => {
      const node: FacetSymbolNode = {
        name: 'BaseClass',
        kind: vscode.SymbolKind.Class,
        uri: vscode.Uri.file('/workspace/src/base.ts'),
        range: new vscode.Range(0, 0, 5, 0),
        selectionRange: new vscode.Range(0, 13, 0, 22),
        category: MemberCategory.All,
        isStatic: false,
        children: [],
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const subtypes = await resolver.resolveTypeHierarchySubtypes(node, cts.token);
      assert.deepStrictEqual(subtypes, []);

      const supertypes = await resolver.resolveTypeHierarchySupertypes(node, cts.token);
      assert.deepStrictEqual(supertypes, []);

      const supertypeNodes = await resolver.resolveTypeHierarchySupertypeNodes(node, cts.token);
      assert.deepStrictEqual(supertypeNodes, []);
    });
  });

  suite('RelationsTreeProvider & Relations Roles Cancellation', () => {
    const testNode: FacetSymbolNode = {
      name: 'calculateTotal',
      kind: vscode.SymbolKind.Method,
      uri: vscode.Uri.file('/workspace/src/order.ts'),
      range: new vscode.Range(5, 2, 10, 3),
      selectionRange: new vscode.Range(5, 2, 5, 16),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    test('fetchReferencesForNode aborts when token is cancelled', async () => {
      let commandInvoked = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeReferenceProvider') {
          commandInvoked = true;
          return [
            {
              uri: testNode.uri,
              range: new vscode.Range(20, 4, 20, 18),
            },
          ];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const refs = await relationsProvider.fetchReferencesForNode(testNode, cts.token);
      assert.deepStrictEqual(refs, []);
      assert.strictEqual(commandInvoked, false);
    });

    test('fetchCallersForNode aborts when token is cancelled', async () => {
      let commandInvoked = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.prepareCallHierarchy') {
          commandInvoked = true;
          return [];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const callers = await relationsProvider.fetchCallersForNode(testNode, cts.token);
      assert.deepStrictEqual(callers, []);
      assert.strictEqual(commandInvoked, false);
    });

    test('fetchImplementationsForNode aborts when token is cancelled', async () => {
      let commandInvoked = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeImplementationProvider') {
          commandInvoked = true;
          return [];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const impls = await relationsProvider.fetchImplementationsForNode(testNode, cts.token);
      assert.deepStrictEqual(impls, []);
      assert.strictEqual(commandInvoked, false);
    });

    test('fetchDefinitionsForNode and fetchDeclarationsForNode abort when token is cancelled', async () => {
      let defCalled = false;
      let declCalled = false;
      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeDefinitionProvider') {
          defCalled = true;
          return [];
        }
        if (cmd === 'vscode.executeDeclarationProvider') {
          declCalled = true;
          return [];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const cts = new CancellationTokenSource();
      cts.cancel();

      const defs = await relationsProvider.fetchDefinitionsForNode(testNode, cts.token);
      assert.deepStrictEqual(defs, []);
      assert.strictEqual(defCalled, false);

      const decls = await relationsProvider.fetchDeclarationsForNode(testNode, cts.token);
      assert.deepStrictEqual(decls, []);
      assert.strictEqual(declCalled, false);
    });

    test('fetchRelationsForNodes halts across multiple nodes if token is cancelled mid-sequence', async () => {
      const nodeA: FacetSymbolNode = { ...testNode, name: 'methodA' };
      const nodeB: FacetSymbolNode = { ...testNode, name: 'methodB' };

      const cts = new CancellationTokenSource();
      let count = 0;

      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeReferenceProvider') {
          count++;
          // Cancel token immediately after first node executes
          cts.cancel();
          return [
            {
              uri: testNode.uri,
              range: new vscode.Range(10, 0, 10, 5),
            },
          ];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      await relationsProvider.fetchRelationsForNodes([nodeA, nodeB], RelationMode.References, cts.token);
      // Only nodeA should have been processed; nodeB should have been skipped due to cancellation
      assert.strictEqual(count, 1);
    });

    test('relations panes abort promptly in getSlotChildren when cancellation token is passed', async () => {
      const refPane: ReferencesPaneConfig = {
        id: 'facet.pane.4',
        role: PaneRole.References,
        title: 'References',
        visible: true,
        inputSource: PaneInputSource.PreviousPane,
        sort: SortOption.Position,
        filters: createDefaultFilters(),
      };

      const implPane: ImplementationsPaneConfig = {
        id: 'facet.pane.4',
        role: PaneRole.Implementations,
        title: 'Implementations',
        visible: true,
        inputSource: PaneInputSource.PreviousPane,
        sort: SortOption.Position,
        filters: createDefaultFilters(),
      };

      const defPane: DefinitionsPaneConfig = {
        id: 'facet.pane.3',
        role: PaneRole.Definitions,
        title: 'Definitions',
        visible: true,
        inputSource: PaneInputSource.PreviousPane,
        sort: SortOption.Position,
        filters: createDefaultFilters(),
      };

      coordinator.setSlotSelection('facet.pane.2', [testNode]);
      const prevPaneConfig: SymbolsPaneConfig = {
        id: 'facet.pane.2',
        role: PaneRole.Symbols,
        title: 'Members',
        visible: true,
        inputSource: PaneInputSource.PreviousPane,
        sort: SortOption.Name,
        filters: createDefaultFilters(),
        tree: false,
      };
      (coordinator as unknown as { getPreviousPane: (id: string) => unknown }).getPreviousPane = () => prevPaneConfig;

      const cts = new CancellationTokenSource();
      cts.cancel();

      const refItems = await coordinator.getSlotChildren(refPane, undefined, cts.token);
      assert.deepStrictEqual(refItems, []);

      const implItems = await coordinator.getSlotChildren(implPane, undefined, cts.token);
      assert.deepStrictEqual(implItems, []);

      const defItems = await coordinator.getSlotChildren(defPane, undefined, cts.token);
      assert.deepStrictEqual(defItems, []);
    });
  });

  suite('FacetCoordinator.refresh() and sync() Cancellation', () => {
    test('coordinator.refresh(cancelledToken) aborts without throwing or updating cache', async () => {
      const doc = {
        uri: vscode.Uri.file('/workspace/src/app.ts'),
        version: 1,
        getText: () => 'export class App {}',
      };
      coordinator.handleEditorChange({
        document: doc,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      const cts = new CancellationTokenSource();
      cts.cancel();

      // Calling refresh with cancelled token
      await coordinator.refresh(cts.token);

      assert.deepStrictEqual(coordinator.getCachedDocumentSymbols(), []);
    });

    test('consecutive refresh() calls supersede prior operations cleanly without unhandled rejection', async () => {
      const doc = {
        uri: vscode.Uri.file('/workspace/src/concurrent.ts'),
        version: 1,
        getText: () => 'export class Concurrent {}',
      };
      coordinator.handleEditorChange({
        document: doc,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      // Fire multiple refreshes concurrently
      const p1 = coordinator.refresh();
      const p2 = coordinator.refresh();
      const p3 = coordinator.refresh();

      await Promise.all([p1, p2, p3]);

      // State is valid and cached
      const cached = coordinator.getCachedDocumentSymbols();
      assert.ok(cached.length > 0);
      assert.strictEqual(cached[0].name, 'Concurrent');
    });
  });
});
