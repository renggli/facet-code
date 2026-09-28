import * as assert from 'node:assert';
import * as vscode from 'vscode';
import {
  type DirectoryNode,
  FacetCoordinator,
  type ProblemItem,
  type RelationItem,
} from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import {
  type ChangesPaneConfig,
  createDefaultFilters,
  createDirectoriesPane,
  createFilesPane,
  createImplementationsPane,
  createReferencesPane,
  createSymbolsPane,
  type HierarchyPaneConfig,
  type ProblemsPaneConfig,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';
import { type FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { commands, extensions } from './mockVscode';

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
        children: [],
      },
      {
        name: 'defaultConfig',
        kind: vscode.SymbolKind.Constant,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.Constants,
        isStatic: true,
        children: [],
      },
    ],
  };

  test('coordinator handles directories pane role with tree and flat options', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const origFindFiles = vscode.workspace.findFiles;
    const testFiles = [
      vscode.Uri.file('/workspace/src/coordinator/facetCoordinator.ts'),
      vscode.Uri.file('/workspace/src/models/paneConfig.ts'),
      vscode.Uri.file('/workspace/test/unit/coordinator.test.ts'),
    ];
    (vscode.workspace as any).findFiles = async () => testFiles;

    const dirConfigHierarchy = createDirectoriesPane('facet.pane.1', {
      tree: true,
      inputSource: 'project',
    });

    const hierarchyRoots = await coordinator.getSlotChildren(dirConfigHierarchy);
    assert.ok(hierarchyRoots.length > 0);
    // Tree root items
    const treeItem = coordinator.getSlotTreeItem(dirConfigHierarchy, hierarchyRoots[0]);
    assert.strictEqual(treeItem.iconPath, vscode.ThemeIcon.Folder);

    const dirConfigFlat = createDirectoriesPane('facet.pane.1', {
      tree: false,
      inputSource: 'project',
    });
    const flatDirs = await coordinator.getSlotChildren(dirConfigFlat);
    assert.ok(flatDirs.length >= 2);

    (vscode.workspace as any).findFiles = origFindFiles;
    coordinator.dispose();
  });

  test('coordinator filters hierarchical directories based on leaves and removes duplicates nested elsewhere', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const origFindFiles = vscode.workspace.findFiles;
    const testFiles = [
      vscode.Uri.file('/workspace/src/services/auth/login.ts'),
      vscode.Uri.file('/workspace/src/services/billing/charge.ts'),
      vscode.Uri.file('/workspace/src/models/user.ts'),
      vscode.Uri.file('/workspace/test/unit/test.ts'),
    ];
    (vscode.workspace as any).findFiles = async () => testFiles;

    // 1. Filter by 'auth': leaf 'src/services/auth' matches
    const dirConfigAuth = createDirectoriesPane('facet.pane.1', {
      tree: true,
      inputSource: 'project',
      globPattern: 'auth',
    });

    const authRoots = await coordinator.getSlotChildren<DirectoryNode>(dirConfigAuth);
    // Only 'src' should be a root. 'services' and 'auth' are nested elsewhere and must not appear in roots
    assert.strictEqual(authRoots.length, 1);
    assert.strictEqual(authRoots[0].name, 'src');
    assert.strictEqual(authRoots[0].relativePath, 'src');

    // Expand 'src': contains 'services', 'models' is pruned
    const srcChildren = await coordinator.getSlotChildren<DirectoryNode>(dirConfigAuth, authRoots[0]);
    assert.strictEqual(srcChildren.length, 1);
    assert.strictEqual(srcChildren[0].name, 'services');

    // Expand 'services': contains 'auth', 'billing' is pruned
    const servicesChildren = await coordinator.getSlotChildren<DirectoryNode>(dirConfigAuth, srcChildren[0]);
    assert.strictEqual(servicesChildren.length, 1);
    assert.strictEqual(servicesChildren[0].name, 'auth');

    // 'auth' has no subdirectories (leaf)
    const authChildren = await coordinator.getSlotChildren<DirectoryNode>(dirConfigAuth, servicesChildren[0]);
    assert.strictEqual(authChildren.length, 0);

    // Parent navigation works
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, servicesChildren[0]), srcChildren[0]);
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, srcChildren[0]), authRoots[0]);
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, authRoots[0]), undefined);

    // 2. Filter by 'nonexistent': returns 0 roots
    const dirConfigNone = createDirectoriesPane('facet.pane.1', {
      tree: true,
      inputSource: 'project',
      globPattern: 'nonexistent',
    });
    const noneRoots = await coordinator.getSlotChildren<DirectoryNode>(dirConfigNone);
    assert.strictEqual(noneRoots.length, 0);

    // 3. No filter: roots should only be 'src' and 'test'; none of the nested directories appear in roots
    const dirConfigAll = createDirectoriesPane('facet.pane.1', {
      tree: true,
      inputSource: 'project',
    });
    const allRoots = await coordinator.getSlotChildren<DirectoryNode>(dirConfigAll);
    assert.strictEqual(allRoots.length, 2);
    const rootRelPaths = allRoots.map((r: DirectoryNode) => r.relativePath);
    assert.ok(rootRelPaths.includes('src'));
    assert.ok(rootRelPaths.includes('test'));
    assert.ok(!rootRelPaths.includes('src/services'));
    assert.ok(!rootRelPaths.includes('src/services/auth'));
    assert.ok(!rootRelPaths.includes('src/services/billing'));
    assert.ok(!rootRelPaths.includes('src/models'));
    assert.ok(!rootRelPaths.includes('test/unit'));

    (vscode.workspace as any).findFiles = origFindFiles;
    coordinator.dispose();
  });

  test('coordinator handles problems pane with severity sorting and tree items', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const fileUri = vscode.Uri.file('/workspace/src/error.ts');
    const origGetDiags = vscode.languages.getDiagnostics;
    const mockDiags: [vscode.Uri, vscode.Diagnostic[]][] = [
      [
        fileUri,
        [
          {
            message: 'Syntax error',
            range: new vscode.Range(10, 0, 10, 5),
            severity: vscode.DiagnosticSeverity.Error,
          } as vscode.Diagnostic,
          {
            message: 'Unused variable',
            range: new vscode.Range(2, 0, 2, 5),
            severity: vscode.DiagnosticSeverity.Warning,
          } as vscode.Diagnostic,
        ],
      ],
    ];
    (vscode.languages as any).getDiagnostics = () => mockDiags;

    const probConfig: ProblemsPaneConfig = {
      ...coordinator.registry.get('problems').defaultConfig('facet.pane.5'),
      inputSource: 'project',
      sort: 'category',
    };

    const problems = await coordinator.getSlotChildren<ProblemItem>(probConfig);
    assert.strictEqual(problems.length, 2);
    // Error before warning
    assert.strictEqual(problems[0].severity, vscode.DiagnosticSeverity.Error);
    assert.strictEqual(problems[1].severity, vscode.DiagnosticSeverity.Warning);

    const treeItem = coordinator.getSlotTreeItem(probConfig, problems[0]);
    assert.strictEqual(treeItem.label, 'Syntax error');
    assert.strictEqual(treeItem.command?.command, 'facet.revealRange');

    (vscode.languages as any).getDiagnostics = origGetDiags;
    coordinator.dispose();
  });

  test('coordinator resolves slot children for symbols according to filters', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const membersPaneConfig: SymbolsPaneConfig = createSymbolsPane('facet.pane.2', {
      title: 'Members',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: { ...createDefaultFilters(), constant: false },
      tree: false,
      visible: true,
    });

    coordinator.setSlotSelection('facet.pane.1', [mockClass]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'symbols' });

    const children = await coordinator.getSlotChildren<FacetSymbolNode>(membersPaneConfig);
    // defaultConfig (constant) is filtered out
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'placeOrder');

    coordinator.dispose();
  });

  test('coordinator always renders icons, context description, and reveal commands on slot tree items', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const node: FacetSymbolNode = {
      name: 'placeOrder',
      detail: '(orderId: string): void',
      kind: vscode.SymbolKind.Method,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.StaticMethods,
      isStatic: true,
      children: [],
    };

    const config: SymbolsPaneConfig = createSymbolsPane('facet.pane.2', {
      title: 'Members',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      tree: false,
      visible: true,
    });

    const item = coordinator.getSlotTreeItem(config, node);
    assert.ok(item.iconPath !== undefined);
    assert.strictEqual(item.description, 'static (orderId: string): void');
    assert.ok(item.command !== undefined);
    assert.strictEqual(item.command?.command, 'facet.revealRange');

    coordinator.dispose();
  });

  test('coordinator resolves type hierarchy roots without duplicates and expands subtypes', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const baseClass: FacetSymbolNode = {
      name: 'BaseClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
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
      superTypes: ['BaseClass'],
    };

    (coordinator as any).cachedWorkspaceTypes = [baseClass, subClass];

    const typesPaneConfig: HierarchyPaneConfig = {
      ...coordinator.registry.get('hierarchy').defaultConfig('facet.pane.1'),
      title: 'Hierarchy',
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      tree: true,
      filters: createDefaultFilters(),
      visible: true,
    };

    // Root children: only BaseClass should be returned! SubClass is omitted from root
    const rootChildren = await coordinator.getSlotChildren<FacetSymbolNode>(typesPaneConfig);
    assert.strictEqual(rootChildren.length, 1);
    assert.strictEqual(rootChildren[0].name, 'BaseClass');

    // BaseClass tree item has Collapsed collapsibleState because it has subtypes
    const baseItem = coordinator.getSlotTreeItem(typesPaneConfig, rootChildren[0]);
    assert.strictEqual(baseItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

    // Expanding BaseClass returns SubClass
    const subChildren = await coordinator.getSlotChildren<FacetSymbolNode>(typesPaneConfig, rootChildren[0]);
    assert.strictEqual(subChildren.length, 1);
    assert.strictEqual(subChildren[0].name, 'SubClass');

    // SubClass tree item has None collapsibleState because it has no further subtypes
    const subItem = coordinator.getSlotTreeItem(typesPaneConfig, subChildren[0]);
    assert.strictEqual(subItem.collapsibleState, vscode.TreeItemCollapsibleState.None);

    coordinator.dispose();
  });

  test('coordinator hydrates missing superTypes from file and does not mix interfaces', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const fakeCode = [
      'export interface IPet {',
      '  speak(): void;',
      '}',
      'export class Animal {',
      '}',
      'export class Dog',
      '  extends Animal',
      '  implements IPet {',
      '}',
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
      children: [],
    };

    const animalNode: FacetSymbolNode = {
      name: 'Animal',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(3, 0, 4, 1),
      selectionRange: new vscode.Range(3, 13, 3, 19),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    const dogNode: FacetSymbolNode = {
      name: 'Dog',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(5, 0, 8, 1),
      selectionRange: new vscode.Range(5, 13, 5, 16),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    (coordinator as any).cachedWorkspaceTypes = [petNode, animalNode, dogNode];

    const hierarchyPaneConfig: HierarchyPaneConfig = {
      ...coordinator.registry.get('hierarchy').defaultConfig('facet.pane.1'),
      title: 'Hierarchy',
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      filters: createDefaultFilters(),
      tree: true,
    };

    const roots = await coordinator.getSlotChildren(hierarchyPaneConfig);
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

  test('coordinator handles files pane role and glob filtering', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const origFindFiles = vscode.workspace.findFiles;
    const testFiles = [
      vscode.Uri.file('/workspace/src/app.ts'),
      vscode.Uri.file('/workspace/src/utils.ts'),
      vscode.Uri.file('/workspace/src/components/button.tsx'),
      vscode.Uri.file('/workspace/test/app.test.ts'),
      vscode.Uri.file('/workspace/README.md'),
    ];

    (vscode.workspace as any).findFiles = async () => testFiles;

    const filesPaneConfig = createFilesPane('facet.pane.1', {
      globPattern: '*.ts',
      sort: 'name',
      tree: true,
    });

    const matched = await coordinator.getSlotChildren<vscode.Uri>(filesPaneConfig);
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

  test('coordinator filters files 1-level (tree: false) vs recursive (tree: true) when directory is selected in previous pane', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const origFindFiles = vscode.workspace.findFiles;
    const testFiles = [
      vscode.Uri.file('/workspace/src/app.ts'),
      vscode.Uri.file('/workspace/src/utils.ts'),
      vscode.Uri.file('/workspace/src/components/button.tsx'),
      vscode.Uri.file('/workspace/src/components/modal/dialog.tsx'),
      vscode.Uri.file('/workspace/test/app.test.ts'),
    ];
    (vscode.workspace as any).findFiles = async () => testFiles;

    const dirNode: DirectoryNode = {
      type: 'directory',
      uri: vscode.Uri.file('/workspace/src'),
      name: 'src',
      relativePath: 'src',
    };

    coordinator.setSlotSelection('facet.pane.1', [dirNode]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'directories' });

    // Test 1-level mode (tree: false)
    const currentConfig = createFilesPane('facet.pane.2', {
      inputSource: 'previousPane',
      tree: false,
    });

    const directFiles = await coordinator.getSlotChildren<vscode.Uri>(currentConfig);
    assert.strictEqual(directFiles.length, 2);
    const directPaths = directFiles.map((u: vscode.Uri) => u.path);
    assert.ok(directPaths.includes('/workspace/src/app.ts'));
    assert.ok(directPaths.includes('/workspace/src/utils.ts'));
    assert.ok(!directPaths.includes('/workspace/src/components/button.tsx'));

    // Test recursive mode (tree: true)
    const recursiveConfig = createFilesPane('facet.pane.2', {
      inputSource: 'previousPane',
      tree: true,
    });

    const allDescendantFiles = await coordinator.getSlotChildren<vscode.Uri>(recursiveConfig);
    assert.strictEqual(allDescendantFiles.length, 4);
    const recursivePaths = allDescendantFiles.map((u: vscode.Uri) => u.path);
    assert.ok(recursivePaths.includes('/workspace/src/app.ts'));
    assert.ok(recursivePaths.includes('/workspace/src/utils.ts'));
    assert.ok(recursivePaths.includes('/workspace/src/components/button.tsx'));
    assert.ok(recursivePaths.includes('/workspace/src/components/modal/dialog.tsx'));
    assert.ok(!recursivePaths.includes('/workspace/test/app.test.ts'));

    (vscode.workspace as any).findFiles = origFindFiles;
    coordinator.dispose();
  });

  test('downstream pane receives union of types across multiple selected files', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const file1Uri = vscode.Uri.file('/workspace/src/file1.ts');
    const file2Uri = vscode.Uri.file('/workspace/src/file2.ts');

    const file1Doc = {
      uri: file1Uri,
      version: 1,
      getText: () => 'export class ClassOne { run(): void {} }',
    };
    const file2Doc = {
      uri: file2Uri,
      version: 1,
      getText: () => 'export class ClassTwo { execute(): void {} }',
    };

    const origOpenTextDocument = vscode.workspace.openTextDocument;
    (vscode.workspace as any).openTextDocument = async (uri: vscode.Uri) => {
      if (uri.fsPath.includes('file1')) {
        return file1Doc;
      }
      return file2Doc;
    };

    const symbolsPaneConfig: SymbolsPaneConfig = createSymbolsPane('facet.pane.2', {
      title: 'Symbols',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      tree: false,
    });

    coordinator.setSlotSelection('facet.pane.1', [file1Uri, file2Uri]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'files' });

    const types = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneConfig);
    assert.strictEqual(types.length, 2);
    const names = types.map((t: FacetSymbolNode) => t.name);
    assert.ok(names.includes('ClassOne'));
    assert.ok(names.includes('ClassTwo'));

    (vscode.workspace as any).openTextDocument = origOpenTextDocument;
    coordinator.dispose();
  });

  test('cursor position tracking updates and reveals target nodes across downstream panes', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

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
      children: [],
    };

    const testType: FacetSymbolNode = {
      name: 'Calculator',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 10, 1),
      selectionRange: new vscode.Range(0, 13, 0, 23),
      category: MemberCategory.All,
      isStatic: false,
      children: [testMember],
    };

    (coordinator as any).cachedDocumentSymbols = [testType];
    (coordinator as any).cachedDocumentUri = fileUri.toString();

    // Default visible: [pane.1 (directories), pane.2 (files), pane.3 (types), pane.4 (members)]
    const panes = manager.getVisiblePanes();
    panes[2].selectionSource = 'cursor'; // types
    panes[3].selectionSource = 'cursor'; // members

    const mockEditor = {
      document: {
        uri: fileUri,
        version: 1,
        getText: () => '',
      },
      selection: {
        active: new vscode.Position(6, 4),
      },
    };

    await coordinator.handleSelectionChange(mockEditor as any);

    assert.ok(revealed.length >= 2);
    const slotTypesReveal = revealed.find((r) => r.slotId === panes[2].id);
    const slotMembersReveal = revealed.find((r) => r.slotId === panes[3].id);

    assert.ok(slotTypesReveal);
    assert.strictEqual(slotTypesReveal.node.name, 'Calculator');

    assert.ok(slotMembersReveal);
    assert.strictEqual(slotMembersReveal.node.name, 'calculate');

    coordinator.dispose();
  });

  test('coordinator handles changes pane role with dirty documents and git extension', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const dirtyUri = vscode.Uri.file('/workspace/src/dirty.ts');
    const gitUri = vscode.Uri.file('/workspace/src/git-modified.ts');

    // Mock textDocuments
    (vscode.workspace as any).textDocuments = [
      { uri: dirtyUri, isDirty: true },
      { uri: vscode.Uri.file('/workspace/src/clean.ts'), isDirty: false },
    ];

    // Mock git extension
    extensions.registerExtension('vscode.git', {
      isActive: true,
      exports: {
        getAPI: () => ({
          repositories: [
            {
              state: {
                workingTreeChanges: [{ uri: gitUri }],
                indexChanges: [],
              },
            },
          ],
        }),
      },
    });

    const changesConfig: ChangesPaneConfig = {
      ...coordinator.registry.get('changes').defaultConfig('facet.pane.5'),
      inputSource: 'project',
      sort: 'name',
    };

    const children = await coordinator.getSlotChildren<vscode.Uri>(changesConfig);
    assert.strictEqual(children.length, 2);
    const paths = children.map((u: vscode.Uri) => u.path);
    assert.ok(paths.includes('/workspace/src/dirty.ts'));
    assert.ok(paths.includes('/workspace/src/git-modified.ts'));

    const treeItem = coordinator.getSlotTreeItem(changesConfig, children[0]);
    assert.ok(treeItem.label);
    assert.strictEqual(treeItem.command?.command, 'vscode.open');

    extensions.clearExtensions();
    (vscode.workspace as any).textDocuments = [];
    coordinator.dispose();
  });

  test('coordinator handles relations roles (definitions, declarations, callers, implementations, references)', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const targetUri = vscode.Uri.file('/workspace/src/app.ts');
    const targetMember: FacetSymbolNode = {
      name: 'runApp',
      kind: vscode.SymbolKind.Method,
      uri: targetUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [],
    };

    coordinator.setSlotSelection('facet.pane.4', [targetMember]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.4', role: 'symbols' });

    // Mock relations fetch
    (relationsProvider as any).fetchRelationsForNodes = async (_nodes: any, mode: string) => [
      {
        label: `preview for ${mode}`,
        description: 'src/app.ts:1',
        tooltip: 'tooltip',
        iconPath: new vscode.ThemeIcon('references'),
        uri: targetUri,
        range: dummyRange,
      },
    ];

    const defs = await coordinator.getSlotChildren<RelationItem>(
      coordinator.registry.get('definitions').defaultConfig('facet.pane.5'),
    );
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].label, 'preview for definitions');

    const decls = await coordinator.getSlotChildren<RelationItem>(
      coordinator.registry.get('declarations').defaultConfig('facet.pane.5'),
    );
    assert.strictEqual(decls.length, 1);
    assert.strictEqual(decls[0].label, 'preview for declarations');

    const impls = await coordinator.getSlotChildren<RelationItem>(createImplementationsPane('facet.pane.5'));
    assert.strictEqual(impls.length, 1);
    assert.strictEqual(impls[0].label, 'preview for implementations');

    const refs = await coordinator.getSlotChildren<RelationItem>(createReferencesPane('facet.pane.5'));
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].label, 'preview for references');

    const callers = await coordinator.getSlotChildren<RelationItem>(
      coordinator.registry.get('callers').defaultConfig('facet.pane.5'),
    );
    assert.strictEqual(callers.length, 1);
    assert.strictEqual(callers[0].label, 'preview for callers');

    const treeItem = coordinator.getSlotTreeItem(createReferencesPane('facet.pane.5'), refs[0]);
    assert.strictEqual(treeItem.label, 'preview for references');
    assert.strictEqual(treeItem.command?.command, 'facet.revealRange');

    coordinator.dispose();
  });

  test('coordinator handles openEditors and activeEditor input sources across directories and files', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const fileA = vscode.Uri.file('/workspace/src/service/a.ts');
    const fileB = vscode.Uri.file('/workspace/src/utils/b.ts');

    (vscode.workspace as any).textDocuments = [
      { uri: fileA, isClosed: false },
      { uri: fileB, isClosed: false },
    ];
    (vscode.window as any).activeTextEditor = {
      document: { uri: fileA, getText: () => '', version: 1 },
    };

    // 1. Files with openEditors
    const filesOpen = await coordinator.getSlotChildren<vscode.Uri>(
      createFilesPane('facet.pane.2', { inputSource: 'openEditors' }),
    );
    assert.strictEqual(filesOpen.length, 2);

    // 2. Files with activeEditor
    const filesActive = await coordinator.getSlotChildren<vscode.Uri>(
      createFilesPane('facet.pane.2', { inputSource: 'activeEditor' }),
    );
    assert.strictEqual(filesActive.length, 1);
    assert.strictEqual(filesActive[0].path, fileA.path);

    // 3. Directories with openEditors
    const dirOpen = await coordinator.getSlotChildren<DirectoryNode>(
      createDirectoriesPane('facet.pane.1', { inputSource: 'openEditors', tree: false }),
    );
    assert.ok(dirOpen.length >= 2);

    // 4. Directories with activeEditor
    const dirActive = await coordinator.getSlotChildren<DirectoryNode>(
      createDirectoriesPane('facet.pane.1', { inputSource: 'activeEditor', tree: false }),
    );
    assert.strictEqual(dirActive.length, 1);

    (vscode.workspace as any).textDocuments = [];
    (vscode.window as any).activeTextEditor = undefined;
    coordinator.dispose();
  });

  test('coordinator handles getSlotParent and handleSlotSelection across various item types', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const docUri = vscode.Uri.file('/workspace/src/app.ts');
    const memberNode: FacetSymbolNode = {
      name: 'memberFn',
      kind: vscode.SymbolKind.Method,
      uri: docUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [],
    };
    const parentNode: FacetSymbolNode = {
      name: 'ParentClass',
      kind: vscode.SymbolKind.Class,
      uri: docUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [memberNode],
    };
    memberNode.parent = parentNode;

    const dirNode: DirectoryNode = {
      type: 'directory',
      name: 'service',
      relativePath: 'src/service',
      uri: vscode.Uri.file('/workspace/src/service'),
    };

    const problemItem: ProblemItem = {
      type: 'problem',
      label: 'Type error',
      message: 'Type error',
      description: 'src/app.ts:1',
      tooltip: 'src/app.ts:1 - Type error',
      severity: vscode.DiagnosticSeverity.Error,
      uri: docUri,
      range: dummyRange,
      iconPath: new vscode.ThemeIcon('error'),
    };

    // Test getSlotParent
    const symbolsPane = createSymbolsPane('facet.pane.3');
    const parentOfMember = coordinator.getSlotParent<FacetSymbolNode>(symbolsPane, memberNode);
    assert.strictEqual(parentOfMember?.name, 'ParentClass');

    const dirsPane = createDirectoriesPane('facet.pane.1');
    const parentOfDir = coordinator.getSlotParent(dirsPane, dirNode);
    assert.strictEqual(parentOfDir, undefined);

    const problemsPane = coordinator.registry.get('problems').defaultConfig('facet.pane.5');
    assert.strictEqual(coordinator.getSlotParent(problemsPane, problemItem), undefined);

    // Test handleSlotSelection
    let textDocOpened = false;
    commands.setHandler('vscode.open', (uri: any) => {
      textDocOpened = true;
      assert.strictEqual(uri.fsPath, docUri.fsPath);
    });

    // Selecting a file opens text document
    await coordinator.handleSlotSelection('facet.pane.2', [docUri]);
    assert.ok(textDocOpened);

    // Selecting a directory does NOT open text document
    textDocOpened = false;
    await coordinator.handleSlotSelection('facet.pane.1', [dirNode]);
    assert.strictEqual(textDocOpened, false);

    // Selecting a problem item reveals range
    let revealedUri: any;
    commands.setHandler('facet.revealRange', (uri: any) => {
      revealedUri = uri;
    });
    await coordinator.handleSlotSelection('facet.pane.5', [problemItem]);
    assert.strictEqual(revealedUri.fsPath, docUri.fsPath);

    commands.clearHandlers();
    coordinator.dispose();
  });

  test('coordinator handles combined symbols pane: file input enumerates types, type input enumerates members, with tree and flat options', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const fileUri = vscode.Uri.file('/workspace/src/example.ts');

    const nestedMember: FacetSymbolNode = {
      name: 'nestedHelper',
      kind: vscode.SymbolKind.Function,
      uri: fileUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    const directMember: FacetSymbolNode = {
      name: 'doWork',
      kind: vscode.SymbolKind.Method,
      uri: fileUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [nestedMember],
    };

    const innerType: FacetSymbolNode = {
      name: 'InnerType',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    const outerType: FacetSymbolNode = {
      name: 'OuterType',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [directMember, innerType],
    };
    directMember.parent = outerType;
    nestedMember.parent = directMember;
    innerType.parent = outerType;

    const mockDoc = {
      uri: fileUri,
      version: 1,
      getText: () => 'class OuterType { doWork() { function nestedHelper() {} } class InnerType {} }',
    };

    const origOpenTextDoc = vscode.workspace.openTextDocument;
    (vscode.workspace as any).openTextDocument = async () => mockDoc;

    // Mock document symbols returned by LSP
    (coordinator as any).resolver.resolveDocumentSymbols = async () => [outerType];

    // --- Scenario 1: Input is files, tree = true ---
    const symbolsPaneFilesTree: SymbolsPaneConfig = createSymbolsPane('facet.pane.3', {
      inputSource: 'previousPane',
      tree: true,
    });

    coordinator.setSlotSelection('facet.pane.2', [fileUri]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.2', role: 'files' });

    // Root children should be top-level types (OuterType only)
    const rootTypesTree = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneFilesTree);
    assert.strictEqual(rootTypesTree.length, 1);
    assert.strictEqual(rootTypesTree[0].name, 'OuterType');

    // Tree item for OuterType should be collapsible
    const treeItem = coordinator.getSlotTreeItem(symbolsPaneFilesTree, rootTypesTree[0]);
    assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

    // Expanding OuterType in tree returns its members (doWork and innerType)
    const outerChildren = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneFilesTree, rootTypesTree[0]);
    assert.strictEqual(outerChildren.length, 2);
    const childNames = outerChildren.map((c) => c.name);
    assert.ok(childNames.includes('doWork'));
    assert.ok(childNames.includes('InnerType'));

    // --- Scenario 2: Input is files, tree = false ---
    const symbolsPaneFilesFlat: SymbolsPaneConfig = createSymbolsPane('facet.pane.3', {
      inputSource: 'previousPane',
      tree: false,
    });

    const rootTypesFlat = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneFilesFlat);
    assert.strictEqual(rootTypesFlat.length, 1);
    assert.strictEqual(rootTypesFlat[0].name, 'OuterType');

    // Tree is false: tree item has collapsibleState None
    const flatItem = coordinator.getSlotTreeItem(symbolsPaneFilesFlat, rootTypesFlat[0]);
    assert.strictEqual(flatItem.collapsibleState, vscode.TreeItemCollapsibleState.None);

    // Tree is false: passing element returns empty array
    const flatChildren = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneFilesFlat, rootTypesFlat[0]);
    assert.strictEqual(flatChildren.length, 0);

    // --- Scenario 3: Input is another type (e.g. from previous pane) ---
    const symbolsPaneFromType: SymbolsPaneConfig = createSymbolsPane('facet.pane.4', {
      inputSource: 'previousPane',
      tree: false,
    });

    // Upstream pane has OuterType selected
    coordinator.setSlotSelection('facet.pane.3', [outerType]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.3', role: 'symbols' });

    // Since input is a type, it enumerates the type's members!
    const members = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPaneFromType);
    assert.strictEqual(members.length, 2);
    const memberNames = members.map((m) => m.name);
    assert.ok(memberNames.includes('doWork'));
    assert.ok(memberNames.includes('InnerType'));

    (vscode.workspace as any).openTextDocument = origOpenTextDoc;
    coordinator.dispose();
  });

  test('handleSelectionChange preserves multi-selection unless force is specified', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);

    const fileUri = vscode.Uri.file('/workspace/src/test.ts');
    const testMember: FacetSymbolNode = {
      name: 'calculate',
      kind: vscode.SymbolKind.Method,
      uri: fileUri,
      range: new vscode.Range(5, 2, 7, 3),
      selectionRange: new vscode.Range(5, 9, 5, 18),
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [],
    };
    const testType: FacetSymbolNode = {
      name: 'Calculator',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 10, 1),
      selectionRange: new vscode.Range(0, 13, 0, 23),
      category: MemberCategory.All,
      isStatic: false,
      children: [testMember],
    };
    (coordinator as any).cachedDocumentSymbols = [testType];
    (coordinator as any).cachedDocumentUri = fileUri.toString();

    const panes = manager.getVisiblePanes();
    const typesPane = panes[2];
    typesPane.selectionSource = 'cursor';

    // Simulate user multi-selection of 2 types
    const dummyTypeA: FacetSymbolNode = { ...testType, name: 'CalculatorA' };
    const dummyTypeB: FacetSymbolNode = { ...testType, name: 'CalculatorB' };
    coordinator.setSlotSelection(typesPane.id, [dummyTypeA, dummyTypeB]);

    const mockEditor = {
      document: { uri: fileUri, version: 1, getText: () => '' },
      selection: { active: new vscode.Position(6, 4) },
    };

    // 1. Passive caret move: must NOT overwrite multi-selection!
    await coordinator.handleSelectionChange(mockEditor as any);
    const preservedSelection = coordinator.getSlotSelection<FacetSymbolNode>(typesPane.id);
    assert.strictEqual(preservedSelection.length, 2);
    assert.strictEqual(preservedSelection[0].name, 'CalculatorA');
    assert.strictEqual(preservedSelection[1].name, 'CalculatorB');

    // 2. Forced sync: MUST overwrite multi-selection with cursor element!
    const targetSlot = await coordinator.handleSelectionChange(mockEditor as any, { force: true });
    assert.ok(targetSlot);
    const forcedSelection = coordinator.getSlotSelection<FacetSymbolNode>(typesPane.id);
    assert.strictEqual(forcedSelection.length, 1);
    assert.strictEqual(forcedSelection[0].name, 'Calculator');

    coordinator.dispose();
  });

  test('handleSelectionChange suppresses redundant updates when selection is unchanged', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);

    const fileUri = vscode.Uri.file('/workspace/src/test.ts');
    const testMember: FacetSymbolNode = {
      name: 'calculate',
      kind: vscode.SymbolKind.Method,
      uri: fileUri,
      range: new vscode.Range(5, 2, 7, 3),
      selectionRange: new vscode.Range(5, 9, 5, 18),
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [],
    };
    const testType: FacetSymbolNode = {
      name: 'Calculator',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 10, 1),
      selectionRange: new vscode.Range(0, 13, 0, 23),
      category: MemberCategory.All,
      isStatic: false,
      children: [testMember],
    };
    (coordinator as any).cachedDocumentSymbols = [testType];
    (coordinator as any).cachedDocumentUri = fileUri.toString();

    const panes = manager.getVisiblePanes();
    panes[2].selectionSource = 'cursor';
    panes[3].selectionSource = 'cursor';

    let reveals = 0;
    coordinator.onRevealInView(() => {
      reveals++;
    });

    const mockEditor = {
      document: { uri: fileUri, version: 1, getText: () => '' },
      selection: { active: new vscode.Position(6, 4) },
    };

    // First selection change: reveals Calculator and calculate
    await coordinator.handleSelectionChange(mockEditor as any);
    const initialReveals = reveals;
    assert.ok(initialReveals >= 2);

    // Second selection change at same location: should be a no-op (no extra reveals)
    await coordinator.handleSelectionChange(mockEditor as any);
    assert.strictEqual(reveals, initialReveals, 'Redundant reveals should be suppressed');

    coordinator.dispose();
  });

  test('all pane tree items have contextValue and resourceUri set for standard context menus', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const testUri = vscode.Uri.file('/workspace/src/example.ts');

    // 1. Files pane
    const filesCfg = createFilesPane('facet.pane.2');
    const fileTreeItem = coordinator.getSlotTreeItem(filesCfg, testUri);
    assert.strictEqual(fileTreeItem.resourceUri?.toString(), testUri.toString());
    assert.strictEqual(fileTreeItem.contextValue, 'facetFile');

    // 2. Directories pane
    const dirCfg = createDirectoriesPane('facet.pane.1');
    const dirNode = {
      name: 'src',
      uri: vscode.Uri.file('/workspace/src'),
      relativePath: 'src',
      type: 'directory' as const,
      children: [],
    };
    const dirTreeItem = coordinator.getSlotTreeItem(dirCfg, dirNode);
    assert.strictEqual(dirTreeItem.resourceUri?.toString(), dirNode.uri.toString());
    assert.strictEqual(dirTreeItem.contextValue, 'facetDirectory');

    // 3. Changes pane
    const changesCfg = coordinator.registry.get('changes').defaultConfig('facet.pane.1');
    const changeTreeItem = coordinator.getSlotTreeItem(changesCfg, testUri);
    assert.strictEqual(changeTreeItem.resourceUri?.toString(), testUri.toString());
    assert.strictEqual(changeTreeItem.contextValue, 'facetFile');

    // 4. Symbols pane
    const symCfg = createSymbolsPane('facet.pane.3');
    const symNode: FacetSymbolNode = {
      name: 'MyClass',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(0, 0, 5, 0),
      selectionRange: new vscode.Range(0, 6, 0, 13),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };
    const symTreeItem = coordinator.getSlotTreeItem(symCfg, symNode);
    assert.strictEqual(symTreeItem.resourceUri?.toString(), testUri.toString());
    assert.strictEqual(symTreeItem.contextValue, 'facetSymbol');

    // 5. Hierarchy pane
    const hierCfg = coordinator.registry.get('hierarchy').defaultConfig('facet.pane.3');
    const hierTreeItem = coordinator.getSlotTreeItem(hierCfg, symNode);
    assert.strictEqual(hierTreeItem.resourceUri?.toString(), testUri.toString());
    assert.strictEqual(hierTreeItem.contextValue, 'facetSymbol');

    // 6. Problems pane
    const probCfg = coordinator.registry.get('problems').defaultConfig('facet.pane.4');
    const probItem = {
      uri: testUri,
      range: new vscode.Range(1, 0, 1, 10),
      message: 'Syntax error',
      severity: vscode.DiagnosticSeverity.Error,
      label: 'Syntax error',
      description: 'example.ts:2',
      type: 'problem' as const,
    };
    const probTreeItem = coordinator.getSlotTreeItem(probCfg, probItem);
    assert.strictEqual(probTreeItem.resourceUri?.toString(), testUri.toString());
    assert.strictEqual(probTreeItem.contextValue, 'facetProblem');

    coordinator.dispose();
  });

  test('coordinator handles document, diagnostics, and file system change events', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    let refreshedSlots: string[] = [];
    coordinator.onDidRefreshSlot((slotId) => {
      refreshedSlots.push(slotId);
    });

    let refreshedAll = 0;
    coordinator.onDidRefreshAll(() => {
      refreshedAll++;
    });

    // 1. Diagnostics change refreshes problems pane
    const p4 = manager.getPane('facet.pane.4');
    if (p4) {
      p4.role = 'problems';
    }
    coordinator.handleDiagnosticsChange([vscode.Uri.file('/workspace/src/test.ts')]);
    assert.ok(refreshedSlots.includes('facet.pane.4'));

    // 2. File system change clears caches and refreshes all
    coordinator.setCachedWorkspaceFiles([vscode.Uri.file('/workspace/src/test.ts')]);
    coordinator.handleFileSystemChange();
    assert.strictEqual(coordinator.getCachedWorkspaceFiles().length, 0);
    assert.strictEqual(refreshedAll, 1);

    // 3. Document change invalidates symbol cache and schedules affected panes refresh
    refreshedSlots = [];
    const testDoc = {
      uri: vscode.Uri.file('/workspace/src/active.ts'),
      version: 2,
      getText: () => 'export class Active {}',
    };
    coordinator.handleDocumentChange(testDoc as any);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(refreshedSlots.length > 0);

    coordinator.dispose();
  });

  test('hierarchy pane dynamically queries LSP subtypes when expanding elements', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const baseUri = vscode.Uri.file('/workspace/src/base.ts');
    const baseNode: FacetSymbolNode = {
      name: 'BaseService',
      kind: vscode.SymbolKind.Class,
      uri: baseUri,
      range: new vscode.Range(0, 0, 10, 0),
      selectionRange: new vscode.Range(0, 6, 0, 17),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    commands.setHandler('vscode.prepareTypeHierarchy', () => [
      {
        name: 'BaseService',
        kind: vscode.SymbolKind.Class,
        uri: baseUri,
        range: baseNode.range,
        selectionRange: baseNode.selectionRange,
      },
    ]);

    commands.setHandler('vscode.provideSubtypes', () => [
      {
        name: 'CustomService',
        kind: vscode.SymbolKind.Class,
        uri: baseUri,
        range: new vscode.Range(12, 0, 20, 0),
        selectionRange: new vscode.Range(12, 6, 12, 19),
      },
    ]);

    const hierConfig: HierarchyPaneConfig = {
      ...coordinator.registry.get('hierarchy').defaultConfig('facet.pane.1'),
      tree: true,
    };
    const subtypes = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig, baseNode);
    assert.strictEqual(subtypes.length, 1);
    assert.strictEqual(subtypes[0].name, 'CustomService');

    commands.clearHandlers();
    coordinator.dispose();
  });

  test('hierarchy pane in list view shows all super classes and then current class, and in tree view shows all super classes and subclasses', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const testUri = vscode.Uri.file('/workspace/src/hierarchy.ts');

    const grandParentNode: FacetSymbolNode = {
      name: 'GrandParent',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(0, 0, 5, 0),
      selectionRange: new vscode.Range(0, 6, 0, 17),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const parentNode: FacetSymbolNode = {
      name: 'Parent',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(6, 0, 11, 0),
      selectionRange: new vscode.Range(6, 6, 6, 12),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['GrandParent'],
    };

    const currentNode: FacetSymbolNode = {
      name: 'CurrentClass',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(12, 0, 17, 0),
      selectionRange: new vscode.Range(12, 6, 12, 18),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['Parent'],
    };

    const childNode: FacetSymbolNode = {
      name: 'ChildClass',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(18, 0, 23, 0),
      selectionRange: new vscode.Range(18, 6, 18, 16),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['CurrentClass'],
    };

    const siblingNode: FacetSymbolNode = {
      name: 'SiblingClass',
      kind: vscode.SymbolKind.Class,
      uri: testUri,
      range: new vscode.Range(24, 0, 29, 0),
      selectionRange: new vscode.Range(24, 6, 24, 18),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['Parent'],
    };

    (coordinator as any).cachedWorkspaceTypes = [grandParentNode, parentNode, currentNode, childNode, siblingNode];

    // Simulate active editor with cursor on CurrentClass
    (coordinator as any).currentEditor = {
      document: { uri: testUri, version: 1 },
      selection: { active: new vscode.Position(13, 2) },
    };
    (coordinator as any).cachedDocumentSymbols = [grandParentNode, parentNode, currentNode, childNode, siblingNode];

    // 1. List View (tree: false)
    const listViewConfig: HierarchyPaneConfig = {
      ...coordinator.registry.get('hierarchy').defaultConfig('facet.pane.1'),
      tree: false,
      inputSource: 'activeEditor',
      selectionSource: 'cursor',
      filters: createDefaultFilters(),
    };

    const listChildren = await coordinator.getSlotChildren<FacetSymbolNode>(listViewConfig);
    // Flat view should include all super classes (GrandParent, Parent), current class (CurrentClass), and all subclasses (SiblingClass, ChildClass)
    assert.strictEqual(listChildren.length, 5);
    const listNames = listChildren.map((c) => c.name);
    assert.deepStrictEqual(listNames, ['GrandParent', 'Parent', 'CurrentClass', 'SiblingClass', 'ChildClass']);

    // 2. Tree View (tree: true - default)
    const treeViewConfig: HierarchyPaneConfig = {
      ...coordinator.registry.get('hierarchy').defaultConfig('facet.pane.2'),
      tree: true,
      inputSource: 'activeEditor',
      selectionSource: 'cursor',
      filters: createDefaultFilters(),
    };

    const treeRoots = await coordinator.getSlotChildren<FacetSymbolNode>(treeViewConfig);
    // Top-most superclass should be root: GrandParent
    assert.strictEqual(treeRoots.length, 1);
    assert.strictEqual(treeRoots[0].name, 'GrandParent');

    // Expanding GrandParent reveals Parent
    const parentChildren = await coordinator.getSlotChildren<FacetSymbolNode>(treeViewConfig, treeRoots[0]);
    assert.strictEqual(parentChildren.length, 1);
    assert.strictEqual(parentChildren[0].name, 'Parent');

    // Expanding Parent reveals CurrentClass AND its sibling subclass (subclass of parent)
    const currentAndSibling = await coordinator.getSlotChildren<FacetSymbolNode>(treeViewConfig, parentChildren[0]);
    assert.strictEqual(currentAndSibling.length, 2);
    const parentSubNames = currentAndSibling.map((c) => c.name);
    assert.ok(parentSubNames.includes('CurrentClass'));
    assert.ok(parentSubNames.includes('SiblingClass'));

    // Expanding CurrentClass reveals ChildClass
    const currentMatch = currentAndSibling.find((c) => c.name === 'CurrentClass')!;
    const childChildren = await coordinator.getSlotChildren<FacetSymbolNode>(treeViewConfig, currentMatch);
    assert.strictEqual(childChildren.length, 1);
    assert.strictEqual(childChildren[0].name, 'ChildClass');

    coordinator.dispose();
  });

  test('cursor selection changes ignore pinned panes and their dependent panes', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    const revealed: { slotId: string; node: unknown }[] = [];
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
      children: [],
    };

    const testType: FacetSymbolNode = {
      name: 'Calculator',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 10, 1),
      selectionRange: new vscode.Range(0, 13, 0, 23),
      category: MemberCategory.All,
      isStatic: false,
      children: [testMember],
    };

    (coordinator as unknown as { cachedDocumentSymbols: FacetSymbolNode[] }).cachedDocumentSymbols = [testType];
    (coordinator as unknown as { cachedDocumentUri: string }).cachedDocumentUri = fileUri.toString();

    const panes = manager.getVisiblePanes();
    panes[2].selectionSource = 'cursor';
    panes[3].selectionSource = 'cursor';

    // Pin pane 3 (Definitions), which also cascades to pane 4 (Members)
    await manager.setPinned(panes[2].id, true);

    const mockEditor = {
      document: {
        uri: fileUri,
        version: 1,
        getText: () => '',
      },
      selection: {
        active: new vscode.Position(6, 4),
      },
    };

    // Selection change should NOT reveal or update pinned pane 3 or dependent pane 4
    await coordinator.handleSelectionChange(mockEditor as unknown as vscode.TextEditor);

    const slotTypesReveal = revealed.find((r) => r.slotId === panes[2].id);
    const slotMembersReveal = revealed.find((r) => r.slotId === panes[3].id);
    assert.strictEqual(slotTypesReveal, undefined);
    assert.strictEqual(slotMembersReveal, undefined);
    assert.strictEqual(coordinator.getSlotSelection(panes[2].id).length, 0);
    assert.strictEqual(coordinator.getSlotSelection(panes[3].id).length, 0);

    // However, when force is true, it overrides pin
    await coordinator.handleSelectionChange(mockEditor as unknown as vscode.TextEditor, { force: true });
    assert.ok(coordinator.getSlotSelection(panes[2].id).length > 0);

    coordinator.dispose();
  });

  test('pinned pane with inputSource activeEditor preserves pinnedUri and does not switch documents', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    const fileA = vscode.Uri.file('/workspace/src/fileA.ts');
    const fileB = vscode.Uri.file('/workspace/src/fileB.ts');

    const typeA: FacetSymbolNode = {
      name: 'ClassInA',
      kind: vscode.SymbolKind.Class,
      uri: fileA,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };
    const typeB: FacetSymbolNode = {
      name: 'ClassInB',
      kind: vscode.SymbolKind.Class,
      uri: fileB,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };

    // Setup resolver mocks
    resolver.resolveDocumentSymbols = async (doc: vscode.TextDocument) => {
      if (doc.uri.fsPath === fileA.fsPath) {
        return [typeA];
      }
      return [typeB];
    };

    // Configure pane 1 as Symbols with inputSource: activeEditor
    const p1 = manager.getVisiblePanes()[0];
    p1.role = 'symbols';
    p1.inputSource = 'activeEditor';

    // Mock active editor fileA
    const mockEditorA = {
      document: { uri: fileA, version: 1, getText: () => '' } as vscode.TextDocument,
    } as vscode.TextEditor;
    (coordinator as unknown as { currentEditor?: vscode.TextEditor }).currentEditor = mockEditorA;

    // Pin pane 1 while on fileA
    await manager.setPinned(p1.id, true);
    assert.strictEqual(p1.pinnedUri, fileA.toString());

    // Switch active editor to fileB
    const mockEditorB = {
      document: { uri: fileB, version: 1, getText: () => '' } as vscode.TextDocument,
    } as vscode.TextEditor;
    (coordinator as unknown as { currentEditor?: vscode.TextEditor }).currentEditor = mockEditorB;

    // Children of pane 1 should still be from pinned fileA (ClassInA), not fileB
    const childrenPinned = await coordinator.getSlotChildren<FacetSymbolNode>(p1);
    assert.strictEqual(childrenPinned.length, 1);
    assert.strictEqual(childrenPinned[0].name, 'ClassInA');

    // Unpin pane 1
    await manager.setPinned(p1.id, false);
    assert.strictEqual(p1.pinnedUri, undefined);

    // Children of pane 1 should now reflect active editor fileB
    const childrenUnpinned = await coordinator.getSlotChildren<FacetSymbolNode>(p1);
    assert.strictEqual(childrenUnpinned.length, 1);
    assert.strictEqual(childrenUnpinned[0].name, 'ClassInB');

    coordinator.dispose();
  });

  test('FacetCoordinator dispose clears all debounce timers and prevents delayed callbacks', async () => {
    const resolver = new SymbolResolver();
    const coordinator = new FacetCoordinator(resolver);
    const testDoc = {
      uri: vscode.Uri.file('/workspace/src/sample.ts'),
      version: 1,
      getText: () => 'export class Sample {}',
    };

    let refreshFired = false;
    coordinator.onDidRefreshSlot(() => {
      refreshFired = true;
    });

    coordinator.handleDocumentChange(testDoc as any);
    assert.ok((coordinator as any).documentChangeDebounceTimer !== undefined);

    coordinator.dispose();

    assert.strictEqual((coordinator as any).documentChangeDebounceTimer, undefined);
    assert.strictEqual((coordinator as any).debounceTimer, undefined);
    assert.strictEqual((coordinator as any).selectionDebounceTimer, undefined);
    assert.strictEqual((coordinator as any).cancellationSource, undefined);

    // Wait past the 250ms debounce delay to verify no delayed execution
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.strictEqual(refreshFired, false);
  });
});
