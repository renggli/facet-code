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
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
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

  test('coordinator respects showIcons, showContext, and followSelection settings', async () => {
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

    const node: FacetSymbolNode = {
      name: 'placeOrder',
      detail: '(orderId: string): void',
      kind: vscode.SymbolKind.Method,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.StaticMethods,
      isStatic: true,
      children: []
    };

    const fullConfig: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    };

    const fullItem = coordinator.getSlotTreeItem(fullConfig, node);
    assert.ok(fullItem.iconPath !== undefined);
    assert.strictEqual(fullItem.description, 'static (orderId: string): void');
    assert.ok(fullItem.command !== undefined);

    const minimalConfig: PaneConfig = {
      ...fullConfig,
      followSelection: false,
      showIcons: false,
      showContext: false
    };

    const minimalItem = coordinator.getSlotTreeItem(minimalConfig, node);
    assert.strictEqual(minimalItem.iconPath, undefined);
    assert.strictEqual(minimalItem.description, undefined);
    assert.strictEqual(minimalItem.command, undefined);

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
      title: 'Types',
      role: 'types',
      inputSource: 'project',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
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

  test('coordinator hydrates missing superTypes from file and does not mix interfaces', async () => {
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

    const fakeCode = [
      'export interface IPet {',
      '  speak(): void;',
      '}',
      'export class Animal {',
      '}',
      'export class Dog',
      '  extends Animal',
      '  implements IPet {',
      '}'
    ].join('\n');

    const origFs = (vscode.workspace as any).fs;
    (vscode.workspace as any).fs = { readFile: async () => Buffer.from(fakeCode, 'utf8') };

    const fileUri = vscode.Uri.file('/test/workspace/models.ts');

    const petNode: FacetSymbolNode = {
      name: 'IPet',
      kind: vscode.SymbolKind.Interface,
      uri: fileUri,
      range: new vscode.Range(0, 0, 2, 1),
      selectionRange: new vscode.Range(0, 17, 0, 21),
      category: MemberCategory.All,
      isStatic: false,
      children: []
    };

    const animalNode: FacetSymbolNode = {
      name: 'Animal',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(3, 0, 4, 1),
      selectionRange: new vscode.Range(3, 13, 3, 19),
      category: MemberCategory.All,
      isStatic: false,
      children: []
    };

    const dogNode: FacetSymbolNode = {
      name: 'Dog',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(5, 0, 8, 1),
      selectionRange: new vscode.Range(5, 13, 5, 16),
      category: MemberCategory.All,
      isStatic: false,
      children: []
    };

    (coordinator as any).cachedWorkspaceTypes = [petNode, animalNode, dogNode];

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      inputSource: 'project',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: true
    };

    const roots = await coordinator.getSlotChildren(typesPaneConfig);
    assert.strictEqual(roots.length, 2);
    const rootNames = roots.map((r: any) => r.name);
    assert.ok(rootNames.includes('Animal'));
    assert.ok(rootNames.includes('IPet'));
    assert.ok(!rootNames.includes('Dog'));

    assert.strictEqual(animalNode.subTypes?.length, 1);
    assert.strictEqual(animalNode.subTypes[0].name, 'Dog');

    assert.strictEqual(petNode.subTypes?.length || 0, 0);

    (vscode.workspace as any).fs = origFs;
    coordinator.dispose();
  });
});

