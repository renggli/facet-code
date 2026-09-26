import * as assert from 'assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';
import { PaneConfig, createDefaultFilters } from '../../models/paneConfig';

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

  test('coordinator handles toggling hierarchy and layout', () => {
    const resolver = new SymbolResolver();
    const typesProvider = new TypesTreeProvider();
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    const coordinator = new FacetCoordinator(
      resolver,
      typesProvider,
      membersProvider,
      relationsProvider
    );

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
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    const coordinator = new FacetCoordinator(
      resolver,
      typesProvider,
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

  test('coordinator propagates type selection to members and relations', async () => {
    const resolver = new SymbolResolver();
    const typesProvider = new TypesTreeProvider();
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    const coordinator = new FacetCoordinator(
      resolver,
      typesProvider,
      membersProvider,
      relationsProvider
    );

    await coordinator.selectTypes([mockClass]);
    const selectedMembers = relationsProvider.getSelectedMembers();
    assert.strictEqual(selectedMembers.length, 1);
    assert.strictEqual(selectedMembers[0].name, 'defaultConfig');

    coordinator.dispose();
  });

  test('coordinator resolves slot children for types and members according to filters', async () => {
    const resolver = new SymbolResolver();
    const typesProvider = new TypesTreeProvider();
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    const coordinator = new FacetCoordinator(
      resolver,
      typesProvider,
      membersProvider,
      relationsProvider
    );

    const membersPaneConfig: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previous',
      navigateOnSelect: true,
      followCursor: true,
      filters: { ...createDefaultFilters(), constants: false },
      display: 'flat',
      visible: true
    };

    coordinator.setSlotSelection('facet.pane.1', [mockClass]);
    // Mock getPreviousPane logic by mocking slot selection directly
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'types' });

    const children = await coordinator.getSlotChildren(membersPaneConfig);
    // defaultConfig (constant) is filtered out
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'placeOrder');

    coordinator.dispose();
  });

  test('coordinator resolves type hierarchy roots without duplicates and expands subtypes', async () => {
    const resolver = new SymbolResolver();
    const typesProvider = new TypesTreeProvider();
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    const coordinator = new FacetCoordinator(
      resolver,
      typesProvider,
      membersProvider,
      relationsProvider
    );

    const baseClass: FacetSymbolNode = {
      name: 'BaseClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: []
    };

    const subClass: FacetSymbolNode = {
      name: 'SubClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['BaseClass']
    };

    (coordinator as any).cachedWorkspaceTypes = [baseClass, subClass];

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.1',
      title: 'Project Types',
      role: 'types',
      inputSource: 'project',
      navigateOnSelect: true,
      followCursor: true,
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: true
    };

    // Root children: only BaseClass should be returned! SubClass is omitted from root
    const rootChildren = await coordinator.getSlotChildren(typesPaneConfig);
    assert.strictEqual(rootChildren.length, 1);
    assert.strictEqual(rootChildren[0].name, 'BaseClass');

    // BaseClass tree item has Collapsed collapsibleState because it has subtypes
    const baseItem = coordinator.getSlotTreeItem(typesPaneConfig, rootChildren[0]);
    assert.strictEqual(baseItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

    // Expanding BaseClass returns SubClass
    const subChildren = await coordinator.getSlotChildren(typesPaneConfig, rootChildren[0]);
    assert.strictEqual(subChildren.length, 1);
    assert.strictEqual(subChildren[0].name, 'SubClass');

    // SubClass tree item has None collapsibleState because it has no further subtypes
    const subItem = coordinator.getSlotTreeItem(typesPaneConfig, subChildren[0]);
    assert.strictEqual(subItem.collapsibleState, vscode.TreeItemCollapsibleState.None);

    coordinator.dispose();
  });
});
