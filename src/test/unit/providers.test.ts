import * as assert from 'assert';
import * as vscode from 'vscode';
import { RelationsTreeProvider, RelationItem } from '../../providers/relationsTreeProvider';
import { FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import { commands } from './mockVscode';

suite('Providers Test Suite', () => {
  const dummyUri = vscode.Uri.file('/path/to/test.ts');
  const dummyRange = new vscode.Range(0, 0, 0, 0);

  const mockType: FacetSymbolNode = {
    name: 'TestClass',
    kind: vscode.SymbolKind.Class,
    uri: dummyUri,
    range: dummyRange,
    selectionRange: dummyRange,
    category: MemberCategory.All,
    isStatic: false,
    children: [
      {
        name: 'doWork',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.InstanceMethods,
        isStatic: false,
        children: []
      }
    ]
  };

  test('RelationsTreeProvider switches modes and generates readable tree items', () => {
    const provider = new RelationsTreeProvider();
    assert.strictEqual(provider.getMode(), 'references');

    provider.setMode('callers');
    assert.strictEqual(provider.getMode(), 'callers');

    provider.setMode('definitions');
    assert.strictEqual(provider.getMode(), 'definitions');

    provider.setMode('declarations');
    assert.strictEqual(provider.getMode(), 'declarations');

    provider.setMode('implementations');
    assert.strictEqual(provider.getMode(), 'implementations');

    provider.setSelectedMembers([mockType.children[0]]);
    assert.strictEqual(provider.getSelectedMembers().length, 1);
    assert.strictEqual(provider.getSelectedMembers()[0].name, 'doWork');

    const sampleItem: RelationItem = {
      label: 'const x = doWork();',
      description: 'src/test.ts:42',
      tooltip: '/path/to/src/test.ts:42\nconst x = doWork();',
      iconPath: new vscode.ThemeIcon('references'),
      uri: dummyUri,
      range: dummyRange
    };

    const treeItem = provider.getTreeItem(sampleItem);
    assert.strictEqual(treeItem.label, 'const x = doWork();');
    assert.strictEqual(treeItem.description, 'src/test.ts:42');
    assert.strictEqual(treeItem.tooltip, '/path/to/src/test.ts:42\nconst x = doWork();');
    assert.strictEqual(treeItem.command?.command, 'facet.revealRange');
  });

  test('RelationsTreeProvider fetchRelationsForNodes queries LSP commands for all modes', async () => {
    const provider = new RelationsTreeProvider();

    // 1. References
    commands.setHandler('vscode.executeReferenceProvider', (uri: any, _pos: any) => [
      { uri, range: dummyRange }
    ]);
    const refs = await provider.fetchRelationsForNodes([mockType.children[0]], 'references');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].uri.toString(), dummyUri.toString());

    // 2. Callers
    commands.setHandler('vscode.prepareCallHierarchy', (uri: any, _pos: any) => [
      { name: 'callerFunc', uri, detail: 'CallerClass', selectionRange: dummyRange }
    ]);
    commands.setHandler('vscode.provideIncomingCalls', () => [
      {
        from: {
          name: 'callerFunc',
          uri: dummyUri,
          detail: 'CallerClass',
          range: dummyRange,
          selectionRange: dummyRange
        }
      }
    ]);
    const callers = await provider.fetchRelationsForNodes([mockType.children[0]], 'callers');
    assert.strictEqual(callers.length, 1);
    assert.strictEqual(callers[0].label, 'CallerClass.callerFunc()');

    // Callers with empty prepareCallHierarchy
    commands.setHandler('vscode.prepareCallHierarchy', () => []);
    const emptyCallers = await provider.fetchRelationsForNodes([mockType.children[0]], 'callers');
    assert.strictEqual(emptyCallers.length, 0);

    // 3. Implementations
    commands.setHandler('vscode.executeImplementationProvider', (uri: any, _pos: any) => [
      { uri, range: dummyRange }
    ]);
    const impls = await provider.fetchRelationsForNodes([mockType.children[0]], 'implementations');
    assert.strictEqual(impls.length, 1);

    // 4. Definitions (Location + LocationLink)
    commands.setHandler('vscode.executeDefinitionProvider', (uri: any, _pos: any) => [
      { uri, range: dummyRange },
      { targetUri: uri, targetRange: dummyRange }
    ]);
    const defs = await provider.fetchRelationsForNodes([mockType.children[0]], 'definitions');
    assert.strictEqual(defs.length, 2);

    // 5. Declarations (Location + LocationLink)
    commands.setHandler('vscode.executeDeclarationProvider', (uri: any, _pos: any) => [
      { uri, range: dummyRange },
      { targetUri: uri, targetRange: dummyRange }
    ]);
    const decls = await provider.fetchRelationsForNodes([mockType.children[0]], 'declarations');
    assert.strictEqual(decls.length, 2);

    // Empty results for definitions
    commands.setHandler('vscode.executeDefinitionProvider', () => []);
    const emptyDefs = await provider.fetchRelationsForNodes([mockType.children[0]], 'definitions');
    assert.strictEqual(emptyDefs.length, 0);

    commands.clearHandlers();
  });
});
