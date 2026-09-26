import * as assert from 'assert';
import * as vscode from 'vscode';
import { type DirectoryNode, FacetCoordinator, type ProblemItem } from '../../coordinator/facetCoordinator';
import {
  createCallersPane,
  createChangesPane,
  createDeclarationsPane,
  createDefaultFilters,
  createDefinitionsPane,
  createDirectoriesPane,
  createFilesPane,
  createHierarchyPane,
  createImplementationsPane,
  createProblemsPane,
  createReferencesPane,
  createTypesPane,
  type PaneConfig,
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

  test('coordinator handles directories pane role with hierarchy and flat display', async () => {
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
      display: 'hierarchy',
      inputSource: 'project',
    });

    const hierarchyRoots = await coordinator.getSlotChildren(dirConfigHierarchy);
    assert.ok(hierarchyRoots.length > 0);
    // Tree root items
    const treeItem = coordinator.getSlotTreeItem(dirConfigHierarchy, hierarchyRoots[0]);
    assert.strictEqual(treeItem.iconPath, vscode.ThemeIcon.Folder);

    const dirConfigFlat = createDirectoriesPane('facet.pane.1', {
      display: 'flat',
      inputSource: 'project',
    });
    const flatDirs = await coordinator.getSlotChildren(dirConfigFlat);
    assert.ok(flatDirs.length >= 2);

    const dirConfigCurrent = createDirectoriesPane('facet.pane.1', {
      display: 'current',
      inputSource: 'project',
    });
    const currentDirs = await coordinator.getSlotChildren(dirConfigCurrent);
    // Top-level only: 'src' and 'test'
    assert.strictEqual(currentDirs.length, 2);
    const currentNames = currentDirs.map((d: any) => d.name);
    assert.ok(currentNames.includes('src'));
    assert.ok(currentNames.includes('test'));

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
      display: 'hierarchy',
      inputSource: 'project',
      globPattern: 'auth',
    });

    const authRoots = await coordinator.getSlotChildren(dirConfigAuth);
    // Only 'src' should be a root. 'services' and 'auth' are nested elsewhere and must not appear in roots
    assert.strictEqual(authRoots.length, 1);
    assert.strictEqual(authRoots[0].name, 'src');
    assert.strictEqual(authRoots[0].relativePath, 'src');

    // Expand 'src': contains 'services', 'models' is pruned
    const srcChildren = await coordinator.getSlotChildren(dirConfigAuth, authRoots[0]);
    assert.strictEqual(srcChildren.length, 1);
    assert.strictEqual(srcChildren[0].name, 'services');

    // Expand 'services': contains 'auth', 'billing' is pruned
    const servicesChildren = await coordinator.getSlotChildren(dirConfigAuth, srcChildren[0]);
    assert.strictEqual(servicesChildren.length, 1);
    assert.strictEqual(servicesChildren[0].name, 'auth');

    // 'auth' has no subdirectories (leaf)
    const authChildren = await coordinator.getSlotChildren(dirConfigAuth, servicesChildren[0]);
    assert.strictEqual(authChildren.length, 0);

    // Parent navigation works
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, servicesChildren[0]), srcChildren[0]);
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, srcChildren[0]), authRoots[0]);
    assert.strictEqual(coordinator.getSlotParent(dirConfigAuth, authRoots[0]), undefined);

    // 2. Filter by 'nonexistent': returns 0 roots
    const dirConfigNone = createDirectoriesPane('facet.pane.1', {
      display: 'hierarchy',
      inputSource: 'project',
      globPattern: 'nonexistent',
    });
    const noneRoots = await coordinator.getSlotChildren(dirConfigNone);
    assert.strictEqual(noneRoots.length, 0);

    // 3. No filter: roots should only be 'src' and 'test'; none of the nested directories appear in roots
    const dirConfigAll = createDirectoriesPane('facet.pane.1', {
      display: 'hierarchy',
      inputSource: 'project',
    });
    const allRoots = await coordinator.getSlotChildren(dirConfigAll);
    assert.strictEqual(allRoots.length, 2);
    const rootRelPaths = allRoots.map((r: any) => r.relativePath);
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

    const probConfig = createProblemsPane('facet.pane.5', {
      inputSource: 'project',
      sort: 'category',
    });

    const problems = await coordinator.getSlotChildren(probConfig);
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

  test('coordinator resolves slot children for types and members according to filters', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const membersPaneConfig: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: { ...createDefaultFilters(), constant: false },
      display: 'flat',
      visible: true,
    };

    coordinator.setSlotSelection('facet.pane.1', [mockClass]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'types' });

    const children = await coordinator.getSlotChildren(membersPaneConfig);
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

    const config: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true,
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

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: true,
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

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: true,
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

  test('coordinator filters files non-recursively vs recursively when directory is selected in previous pane', async () => {
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

    const dirNode = {
      type: 'directory',
      uri: vscode.Uri.file('/workspace/src'),
      name: 'src',
      relativePath: 'src',
    };

    coordinator.setSlotSelection('facet.pane.1', [dirNode]);
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.1', role: 'directories' });

    // Test current display mode (immediate direct children)
    const currentConfig = createFilesPane('facet.pane.2', {
      inputSource: 'previousPane',
      display: 'current',
    });

    const directFiles = await coordinator.getSlotChildren(currentConfig);
    assert.strictEqual(directFiles.length, 2);
    const directPaths = directFiles.map((u: vscode.Uri) => u.path);
    assert.ok(directPaths.includes('/workspace/src/app.ts'));
    assert.ok(directPaths.includes('/workspace/src/utils.ts'));
    assert.ok(!directPaths.includes('/workspace/src/components/button.tsx'));

    // Test flat display mode (recursively traverses and flattens)
    const flatConfig = createFilesPane('facet.pane.2', {
      inputSource: 'previousPane',
      display: 'flat',
    });

    const allDescendantFiles = await coordinator.getSlotChildren(flatConfig);
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

    const typesPaneConfig: PaneConfig = {
      id: 'facet.pane.2',
      title: 'Types',
      role: 'types',
      inputSource: 'previousPane',
      selectionSource: 'none',
      sort: 'name',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true,
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
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

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

    const changesConfig = createChangesPane('facet.pane.5', {
      inputSource: 'project',
      sort: 'name',
    });

    const children = await coordinator.getSlotChildren(changesConfig);
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
    (coordinator as any).getPreviousPane = () => ({ id: 'facet.pane.4', role: 'members' });

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

    const defs = await coordinator.getSlotChildren(createDefinitionsPane('facet.pane.5'));
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].label, 'preview for definitions');

    const decls = await coordinator.getSlotChildren(createDeclarationsPane('facet.pane.5'));
    assert.strictEqual(decls.length, 1);
    assert.strictEqual(decls[0].label, 'preview for declarations');

    const impls = await coordinator.getSlotChildren(createImplementationsPane('facet.pane.5'));
    assert.strictEqual(impls.length, 1);
    assert.strictEqual(impls[0].label, 'preview for implementations');

    const refs = await coordinator.getSlotChildren(createReferencesPane('facet.pane.5'));
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].label, 'preview for references');

    const callers = await coordinator.getSlotChildren(createCallersPane('facet.pane.5'));
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
    const filesOpen = await coordinator.getSlotChildren(
      createFilesPane('facet.pane.2', { inputSource: 'openEditors' }),
    );
    assert.strictEqual(filesOpen.length, 2);

    // 2. Files with activeEditor
    const filesActive = await coordinator.getSlotChildren(
      createFilesPane('facet.pane.2', { inputSource: 'activeEditor' }),
    );
    assert.strictEqual(filesActive.length, 1);
    assert.strictEqual(filesActive[0].path, fileA.path);

    // 3. Directories with openEditors
    const dirOpen = await coordinator.getSlotChildren(
      createDirectoriesPane('facet.pane.1', { inputSource: 'openEditors', display: 'flat' }),
    );
    assert.ok(dirOpen.length >= 2);

    // 4. Directories with activeEditor
    const dirActive = await coordinator.getSlotChildren(
      createDirectoriesPane('facet.pane.1', { inputSource: 'activeEditor', display: 'flat' }),
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
    const typesPane = createTypesPane('facet.pane.3');
    const parentOfMember = coordinator.getSlotParent(typesPane, memberNode);
    assert.strictEqual(parentOfMember?.name, 'ParentClass');

    const dirsPane = createDirectoriesPane('facet.pane.1');
    const parentOfDir = coordinator.getSlotParent(dirsPane, dirNode);
    assert.strictEqual(parentOfDir, undefined);

    const problemsPane = createProblemsPane('facet.pane.5');
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
});
