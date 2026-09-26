import * as assert from 'assert';
import * as vscode from 'vscode';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { CategoriesTreeProvider } from '../../providers/categoriesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { FacetSymbolNode, MemberCategory } from '../../models/symbolNode';

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
      },
      {
        name: 'instanceField',
        kind: vscode.SymbolKind.Field,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.Fields,
        isStatic: false,
        children: []
      },
      {
        name: 'createInstance',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.StaticMethods,
        isStatic: true,
        children: []
      }
    ]
  };

  test('TypesTreeProvider extracts types and creates tree items with scope formatting', () => {
    const provider = new TypesTreeProvider();
    provider.setSymbols([mockType]);

    const types = provider.getTypes();
    assert.strictEqual(types.length, 1);
    assert.strictEqual(types[0].name, 'TestClass');

    // Default scope is file
    assert.strictEqual(provider.scope, 'file');
    let treeItem = provider.getTreeItem(types[0]);
    assert.strictEqual(treeItem.label, 'TestClass');
    assert.strictEqual(treeItem.command?.command, 'facet.revealRange');

    // Switch to project scope
    provider.scope = 'project';
    treeItem = provider.getTreeItem(types[0]);
    assert.strictEqual(treeItem.description, 'test.ts');
  });

  test('CategoriesTreeProvider manages active category and counts', () => {
    const provider = new CategoriesTreeProvider();
    assert.strictEqual(provider.getSelectedCategory(), MemberCategory.All);

    provider.setSelectedCategory(MemberCategory.Constructors);
    assert.strictEqual(provider.getSelectedCategory(), MemberCategory.Constructors);

    provider.setCounts({ [MemberCategory.Constructors]: 2 });
    const children = provider.getChildren() as { id: MemberCategory; label: string }[];
    const ctorItem = children.find((c) => c.id === MemberCategory.Constructors)!;
    const treeItem = provider.getTreeItem(ctorItem as any);
    assert.strictEqual(treeItem.description, '2 (active)');
  });

  test('MembersTreeProvider aggregates and filters by side and category', () => {
    const provider = new MembersTreeProvider();
    provider.setSelectedTypes([mockType]);

    // Initial state: both sides, all categories
    let members = provider.getFilteredMembers();
    assert.strictEqual(members.length, 3);

    // Switch to instance side
    provider.setClassSide('instance');
    members = provider.getFilteredMembers();
    assert.strictEqual(members.length, 2);
    assert.ok(members.every((m) => !m.isStatic));

    // Switch to class side
    provider.setClassSide('class');
    members = provider.getFilteredMembers();
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].name, 'createInstance');

    // Switch category filter
    provider.setClassSide('both');
    provider.setActiveCategory(MemberCategory.Fields);
    members = provider.getFilteredMembers();
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].name, 'instanceField');

    // Category counts calculation
    const counts = provider.getCategoryCounts();
    assert.strictEqual(counts[MemberCategory.All], 3);
    assert.strictEqual(counts[MemberCategory.StaticMethods], 1);
    assert.strictEqual(counts[MemberCategory.Fields], 1);
  });

  test('RelationsTreeProvider switches modes and updates targets', () => {
    const provider = new RelationsTreeProvider();
    assert.strictEqual(provider.getMode(), 'references');

    provider.setMode('callers');
    assert.strictEqual(provider.getMode(), 'callers');

    provider.setSelectedMembers([mockType.children[0]]);
    assert.strictEqual(provider.getSelectedMembers().length, 1);
    assert.strictEqual(provider.getSelectedMembers()[0].name, 'doWork');
  });
});
