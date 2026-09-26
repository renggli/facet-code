import * as assert from 'assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { CategoriesTreeProvider } from '../../providers/categoriesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';

suite('FacetCoordinator Test Suite', () => {
  const dummyUri = vscode.Uri.file('/path/to/test.ts');
  const dummyRange = new vscode.Range(0, 0, 0, 0);

  const mockClass: FacetSymbolNode = {
    name: 'OrderService',
    kind: vscode.SymbolKind.Class,
    uri: dummyUri,
    range: dummyRange,
    selectionRange: dummyRange,
    category: MemberCategory.All,
    isStatic: false,
    children: [
      {
        name: 'placeOrder',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.InstanceMethods,
        isStatic: false,
        children: []
      },
      {
        name: 'defaultConfig',
        kind: vscode.SymbolKind.Constant,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.Constants,
        isStatic: true,
        children: []
      }
    ]
  };

  test('coordinator handles toggling side, hierarchy, and layout', () => {
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

    // Initial side is instance
    assert.strictEqual(coordinator.classSide, 'instance');
    assert.strictEqual(membersProvider.getClassSide(), 'instance');

    // Toggle side
    assert.strictEqual(coordinator.toggleSide(), 'class');
    assert.strictEqual(membersProvider.getClassSide(), 'class');

    assert.strictEqual(coordinator.toggleSide(), 'both');
    assert.strictEqual(membersProvider.getClassSide(), 'both');

    assert.strictEqual(coordinator.toggleSide(), 'instance');
    assert.strictEqual(membersProvider.getClassSide(), 'instance');

    // Toggle hierarchy
    assert.strictEqual(coordinator.hierarchyMode, 'flat');
    assert.strictEqual(coordinator.toggleHierarchy(), 'inherited');
    assert.strictEqual(coordinator.toggleHierarchy(), 'flat');

    // Toggle layout
    assert.strictEqual(coordinator.layoutMode, 'list');
    assert.strictEqual(coordinator.toggleLayout(), 'tree');
    assert.strictEqual(membersProvider.getLayoutMode(), 'tree');
    assert.strictEqual(coordinator.toggleLayout(), 'list');

    // Toggle scope
    assert.strictEqual(coordinator.scope, 'file');
    assert.strictEqual(typesProvider.scope, 'file');

    coordinator.dispose();
  });

  test('coordinator toggles scope between file and project', async () => {
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

    assert.strictEqual(coordinator.scope, 'file');
    const newScope = await coordinator.toggleScope();
    assert.strictEqual(newScope, 'project');
    assert.strictEqual(coordinator.scope, 'project');
    assert.strictEqual(typesProvider.scope, 'project');

    const revertedScope = await coordinator.toggleScope();
    assert.strictEqual(revertedScope, 'file');
    assert.strictEqual(coordinator.scope, 'file');
    assert.strictEqual(typesProvider.scope, 'file');

    coordinator.dispose();
  });

  test('coordinator propagates type and category selection to members and relations', () => {
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

    coordinator.selectTypes([mockClass]);
    // In instance side mode, placeOrder should be selected
    const selectedMembers = relationsProvider.getSelectedMembers();
    assert.strictEqual(selectedMembers.length, 1);
    assert.strictEqual(selectedMembers[0].name, 'placeOrder');

    // Select category Constants -> in instance mode none, switch to both
    coordinator.toggleSide(); // class
    coordinator.toggleSide(); // both
    coordinator.selectCategory(MemberCategory.Constants);
    assert.strictEqual(categoriesProvider.getSelectedCategory(), MemberCategory.Constants);
    assert.strictEqual(membersProvider.getActiveCategory(), MemberCategory.Constants);

    coordinator.dispose();
  });
});
