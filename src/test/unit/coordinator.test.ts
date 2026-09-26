import * as assert from 'assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';
import { PaneConfig, createDefaultFilters, createFilesPane } from '../../models/paneConfig';

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
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: { ...createDefaultFilters(), constant: false },
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

  test('coordinator always renders icons, context description, and reveal commands on slot tree items', async () => {
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

    const config: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    };

    const item = coordinator.getSlotTreeItem(config, node);
    assert.ok(item.iconPath !== undefined);
    assert.strictEqual(item.description, 'static (orderId: string): void');
    assert.ok(item.command !== undefined);
    assert.strictEqual(item.command?.command, 'facet.revealRange');

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
      selectionSource: 'cursor',
      sort: 'name',
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
      selectionSource: 'cursor',
      sort: 'name',
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

  test('coordinator handles files pane role and regexp filtering', async () => {
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

    const origFindFiles = vscode.workspace.findFiles;
    const testFiles = [
      vscode.Uri.file('/workspace/src/app.ts'),
      vscode.Uri.file('/workspace/src/utils.ts'),
      vscode.Uri.file('/workspace/src/components/button.tsx'),
      vscode.Uri.file('/workspace/test/app.test.ts'),
      vscode.Uri.file('/workspace/README.md')
    ];

    (vscode.workspace as any).findFiles = async () => testFiles;

    const filesPaneConfig = createFilesPane('facet.pane.1', {
      filePattern: '.*\\.ts$',
      sort: 'name'
    });

    const matched = await coordinator.getSlotChildren(filesPaneConfig);
    assert.strictEqual(matched.length, 3);
    const paths = matched.map((u: vscode.Uri) => u.path);
    assert.ok(paths.includes('/workspace/src/app.ts'));
    assert.ok(paths.includes('/workspace/src/utils.ts'));
    assert.ok(paths.includes('/workspace/test/app.test.ts'));
    assert.ok(!paths.includes('/workspace/src/components/button.tsx'));
    assert.ok(!paths.includes('/workspace/README.md'));

    const treeItem = coordinator.getSlotTreeItem(filesPaneConfig, matched[0]);
    assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
    assert.ok(treeItem.command);
    assert.strictEqual(treeItem.command.command, 'vscode.open');

    (vscode.workspace as any).findFiles = origFindFiles;
    coordinator.dispose();
  });

  test('downstream pane receives union of types across multiple selected files', async () => {
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

    const file1Uri = vscode.Uri.file('/workspace/src/file1.ts');
    const file2Uri = vscode.Uri.file('/workspace/src/file2.ts');

    const file1Doc = {
      uri: file1Uri,
      version: 1,
      getText: () => 'export class ClassOne { run(): void {} }'
    };
    const file2Doc = {
      uri: file2Uri,
      version: 1,
      getText: () => 'export class ClassTwo { execute(): void {} }'
    };

    const origOpenTextDocument = vscode.workspace.openTextDocument;
    (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
      if (uri.fsPath.includes('file1')) {
        return file1Doc;
      }
      return file2Doc;
    };

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Types',
      role: 'types',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    };

    coordinator.setSlotSelection('facet.pane.1', [file1Uri, file2Uri]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'files' });

    const types = await coordinator.getSlotChildren(typesPaneConfig);
    assert.strictEqual(types.length, 2);
    const names = types.map((t: FacetSymbolNode) => t.name);
    assert.ok(names.includes('ClassOne'));
    assert.ok(names.includes('ClassTwo'));

    (vscode.workspace as any).openTextDocument = origOpenTextDocument;
    coordinator.dispose();
  });

  test('cursor position tracking updates and reveals target nodes across downstream panes', async () => {
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

    const { PanePipelineManager } = require('../../coordinator/panePipelineManager');
    const manager = new PanePipelineManager(coordinator);

    const revealed: { slotId: string; node: any }[] = [];
    coordinator.onRevealInView((event) => {
      revealed.push(event);
    });

    const fileUri = vscode.Uri.file('/workspace/src/test.ts');
    const testMember: FacetSymbolNode = {
      name: 'calculate',
      kind: vscode.SymbolKind.Method,
      uri: fileUri,
      range: new vscode.Range(5, 2, 7, 3),
      selectionRange: new vscode.Range(5, 9, 5, 18),
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: []
    };

    const testType: FacetSymbolNode = {
      name: 'Calculator',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 10, 1),
      selectionRange: new vscode.Range(0, 13, 0, 23),
      category: MemberCategory.All,
      isStatic: false,
      children: [testMember]
    };

    (coordinator as any).cachedDocumentSymbols = [testType];
    (coordinator as any).cachedDocumentUri = fileUri.toString();

    // Panes: Pane 1 Types (cursor), Pane 2 Members (cursor)
    const panes = manager.getVisiblePanes();
    panes[0].selectionSource = 'cursor';
    panes[1].selectionSource = 'cursor';

    const mockEditor = {
      document: {
        uri: fileUri,
        version: 1,
        getText: () => ''
      },
      selection: {
        active: new vscode.Position(6, 4)
      }
    };

    await coordinator.handleSelectionChange(mockEditor as any);

    assert.ok(revealed.length >= 2);
    const slot1Reveal = revealed.find((r) => r.slotId === panes[0].id);
    const slot2Reveal = revealed.find((r) => r.slotId === panes[1].id);

    assert.ok(slot1Reveal);
    assert.strictEqual(slot1Reveal.node.name, 'Calculator');

    assert.ok(slot2Reveal);
    assert.strictEqual(slot2Reveal.node.name, 'calculate');

    coordinator.dispose();
  });
});


