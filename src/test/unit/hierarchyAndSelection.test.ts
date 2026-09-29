import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import {
  createDefaultFilters,
  createDirectoriesPane,
  createFilesPane,
  createSymbolsPane,
  type DefinitionsPaneConfig,
  type DirectoriesPaneConfig,
  type FilesPaneConfig,
  type HierarchyPaneConfig,
  type ReferencesPaneConfig,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';
import { type FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import type { DirectoryNode } from '../../panes/definitions/directoriesPane';
import { HierarchyPaneDefinition } from '../../panes/definitions/hierarchyPane';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { resetMockState, window } from './mockVscode';

suite('Hierarchy Pane & Multi-Selection Union Test Suite', () => {
  let resolver: SymbolResolver;
  let relationsProvider: RelationsTreeProvider;
  let coordinator: FacetCoordinator;
  let manager: PanePipelineManager;
  let origOpenTextDocument: typeof vscode.workspace.openTextDocument;
  let origExecuteCommand: typeof vscode.commands.executeCommand;
  let origFindFiles: typeof vscode.workspace.findFiles;

  setup(() => {
    resetMockState();
    origOpenTextDocument = vscode.workspace.openTextDocument;
    origExecuteCommand = vscode.commands.executeCommand;
    origFindFiles = vscode.workspace.findFiles;

    resolver = new SymbolResolver();
    relationsProvider = new RelationsTreeProvider();
    coordinator = new FacetCoordinator(resolver, relationsProvider);
    manager = new PanePipelineManager(coordinator);
  });

  teardown(() => {
    vscode.workspace.openTextDocument = origOpenTextDocument;
    vscode.commands.executeCommand = origExecuteCommand;
    vscode.workspace.findFiles = origFindFiles;
    coordinator.dispose();
    resetMockState();
  });

  suite('HierarchyPane Capabilities & Display Modes', () => {
    const fileUri = vscode.Uri.file('/workspace/src/shapes.ts');
    const baseNode: FacetSymbolNode = {
      name: 'Shape',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(0, 0, 5, 0),
      selectionRange: new vscode.Range(0, 13, 0, 18),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };
    const circleNode: FacetSymbolNode = {
      name: 'Circle',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(6, 0, 12, 0),
      selectionRange: new vscode.Range(6, 13, 6, 19),
      category: MemberCategory.All,
      isStatic: false,
      superTypes: ['Shape'],
      children: [],
    };
    const squareNode: FacetSymbolNode = {
      name: 'Square',
      kind: vscode.SymbolKind.Class,
      uri: fileUri,
      range: new vscode.Range(13, 0, 20, 0),
      selectionRange: new vscode.Range(13, 13, 13, 19),
      category: MemberCategory.All,
      isStatic: false,
      superTypes: ['Shape'],
      children: [],
    };

    test('HierarchyPane in tree mode returns root classes and dynamically resolves subtypes on expansion', async () => {
      coordinator.setCachedWorkspaceTypes([baseNode, circleNode, squareNode]);

      const hierConfig: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Hierarchy',
        visible: true,
        inputSource: 'project',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
        subclassTypes: ['class'],
      };

      const roots = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig);
      // Shape is the root class; Circle and Square inherit from Shape
      assert.strictEqual(roots.length, 1);
      assert.strictEqual(roots[0].name, 'Shape');

      // Expand Shape
      const subtypes = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig, roots[0]);
      assert.strictEqual(subtypes.length, 2);
      const subNames = subtypes.map((s) => s.name).sort();
      assert.deepStrictEqual(subNames, ['Circle', 'Square']);
    });

    test('HierarchyPane in flat list mode outputs flattened linear inheritance list', async () => {
      coordinator.setCachedWorkspaceTypes([baseNode, circleNode, squareNode]);

      const hierConfig: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Hierarchy Flat',
        visible: true,
        inputSource: 'project',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
        subclassTypes: ['class'],
      };

      const list = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig);
      assert.strictEqual(list.length, 3);
      const names = list.map((item) => item.name);
      assert.ok(names.includes('Shape'));
      assert.ok(names.includes('Circle'));
      assert.ok(names.includes('Square'));
    });

    test('HierarchyPane filters subtypes by subclassTypes (class vs struct)', async () => {
      const baseClass: FacetSymbolNode = {
        name: 'BaseClass',
        kind: vscode.SymbolKind.Class,
        uri: fileUri,
        range: new vscode.Range(25, 0, 30, 0),
        selectionRange: new vscode.Range(25, 13, 25, 22),
        category: MemberCategory.All,
        isStatic: false,
        children: [],
      };
      const subStruct: FacetSymbolNode = {
        name: 'SubStruct',
        kind: vscode.SymbolKind.Struct,
        uri: fileUri,
        range: new vscode.Range(32, 0, 40, 0),
        selectionRange: new vscode.Range(32, 13, 32, 22),
        category: MemberCategory.All,
        isStatic: false,
        superTypes: ['BaseClass'],
        children: [],
      };

      // Case 1: When only 'class' is allowed as subclass, SubStruct is excluded
      coordinator.setCachedWorkspaceTypes([baseClass, subStruct]);
      const classOnlyConfig: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Hierarchy Class Only',
        visible: true,
        inputSource: 'project',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
        subclassTypes: ['class'],
      };

      const rootsClassOnly = await coordinator.getSlotChildren<FacetSymbolNode>(classOnlyConfig);
      const baseRoot = rootsClassOnly.find((r) => r.name === 'BaseClass');
      assert.ok(baseRoot);
      assert.strictEqual(baseRoot.subTypes?.length ?? 0, 0);

      // Case 2: When 'struct' is allowed as subclass, SubStruct is linked under BaseClass
      resolver.clearCache();
      coordinator.setCachedWorkspaceTypes([
        { ...baseClass, subTypes: undefined, parent: undefined },
        { ...subStruct, subTypes: undefined, parent: undefined },
      ]);
      const classAndStructConfig: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Hierarchy With Struct',
        visible: true,
        inputSource: 'project',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
        subclassTypes: ['class', 'struct'],
      };

      const rootsWithStruct = await coordinator.getSlotChildren<FacetSymbolNode>(classAndStructConfig);
      assert.strictEqual(rootsWithStruct.length, 1);
      assert.strictEqual(rootsWithStruct[0].name, 'BaseClass');
      assert.strictEqual(rootsWithStruct[0].subTypes?.length, 1);
      assert.strictEqual(rootsWithStruct[0].subTypes?.[0].name, 'SubStruct');
    });

    test('HierarchyPane configureFilter updates subclassTypes and symbol kinds via quick-pick', async () => {
      const def = new HierarchyPaneDefinition();
      const config = def.defaultConfig('facet.pane.1');

      // 1st picker: user picks 'subclasses'
      window.pushQuickPick({ action: 'subclasses' });
      // 2nd picker: user picks 'class' and 'interface'
      window.pushQuickPick([
        { label: 'Class', key: 'class' },
        { label: 'Interface', key: 'interface' },
      ]);

      const changed = await def.configureFilter(config);
      assert.strictEqual(changed, true);
      assert.deepStrictEqual(config.subclassTypes, ['class', 'interface']);

      // 1st picker: user picks 'kinds'
      window.pushQuickPick({ action: 'kinds' });
      // 2nd picker: user picks filters
      window.pushQuickPick([{ label: 'Class', key: 'class', picked: true }]);

      const changedKinds = await def.configureFilter(config);
      assert.strictEqual(changedKinds, true);
      assert.strictEqual(config.filters?.class, true);
    });
  });

  suite('HierarchyPane Input Source Resolution', () => {
    test('inputSource: openEditors resolves types across tabs and open text documents', async () => {
      const uriA = vscode.Uri.file('/workspace/src/tabA.ts');
      const uriB = vscode.Uri.file('/workspace/src/tabB.ts');

      const docA = {
        uri: uriA,
        version: 1,
        getText: () => 'export class ServiceA {}',
      };
      const docB = {
        uri: uriB,
        version: 1,
        getText: () => 'export class ServiceB {}',
      };

      (vscode.workspace as { openTextDocument: unknown }).openTextDocument = async (uri: unknown) => {
        const u = uri as vscode.Uri;
        if (u.fsPath.includes('tabA')) {
          return docA as unknown as vscode.TextDocument;
        }
        return docB as unknown as vscode.TextDocument;
      };

      // Mock tabGroups
      window.tabGroups = {
        all: [
          {
            tabs: [{ input: { uri: uriA } }, { input: { uri: uriB } }],
          },
        ],
      };

      const hierConfig: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Open Editors Hierarchy',
        visible: true,
        inputSource: 'openEditors',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
        subclassTypes: ['class'],
      };

      const items = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig);
      assert.strictEqual(items.length, 2);
      const names = items.map((i) => i.name).sort();
      assert.deepStrictEqual(names, ['ServiceA', 'ServiceB']);
    });

    test('inputSource: previousPane with file URIs extracts types from upstream files', async () => {
      const fileUri = vscode.Uri.file('/workspace/src/models.ts');
      const doc = {
        uri: fileUri,
        version: 1,
        getText: () => 'export class UpstreamClass { run() {} }',
      };

      (vscode.workspace as { openTextDocument: unknown }).openTextDocument = async () => {
        return doc as unknown as vscode.TextDocument;
      };

      coordinator.setSlotSelection('facet.pane.1', [fileUri]);
      (coordinator as unknown as { getPreviousPane: (id: string) => unknown }).getPreviousPane = () => ({
        id: 'facet.pane.1',
        role: 'files',
      });

      const hierConfig: HierarchyPaneConfig = {
        id: 'facet.pane.2',
        role: 'hierarchy',
        title: 'Downstream Hierarchy',
        visible: true,
        inputSource: 'previousPane',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
        subclassTypes: ['class'],
      };

      const items = await coordinator.getSlotChildren<FacetSymbolNode>(hierConfig);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, 'UpstreamClass');
    });
  });

  suite('Multi-Selection Union Across All Tiers', () => {
    test('Directories -> Files: selecting multiple directories aggregates files in downstream pane', async () => {
      const dir1: DirectoryNode = {
        name: 'models',
        relativePath: 'src/models',
        uri: vscode.Uri.file('/workspace/src/models'),
        type: 'directory',
      };
      const dir2: DirectoryNode = {
        name: 'services',
        relativePath: 'src/services',
        uri: vscode.Uri.file('/workspace/src/services'),
        type: 'directory',
      };

      const file1 = vscode.Uri.file('/workspace/src/models/user.ts');
      const file2 = vscode.Uri.file('/workspace/src/models/product.ts');
      const file3 = vscode.Uri.file('/workspace/src/services/auth.ts');
      const file4 = vscode.Uri.file('/workspace/src/services/payment.ts');
      const file5 = vscode.Uri.file('/workspace/src/ignored/other.ts');

      vscode.workspace.findFiles = async () => [file1, file2, file3, file4, file5];

      const dirPane: DirectoriesPaneConfig = createDirectoriesPane('facet.pane.1');
      const filesPane: FilesPaneConfig = createFilesPane('facet.pane.2', {
        inputSource: 'previousPane',
        tree: false,
      });

      await manager.applyVisiblePanes([dirPane, filesPane]);

      // Multi-select dir1 and dir2
      coordinator.setSlotSelection('facet.pane.1', [dir1, dir2]);

      const files = await coordinator.getSlotChildren<vscode.Uri>(filesPane);
      assert.strictEqual(files.length, 4);
      const paths = files.map((f) => f.fsPath);
      assert.ok(paths.includes(file1.fsPath));
      assert.ok(paths.includes(file2.fsPath));
      assert.ok(paths.includes(file3.fsPath));
      assert.ok(paths.includes(file4.fsPath));
      assert.strictEqual(paths.includes(file5.fsPath), false);
    });

    test('Files -> Types: selecting multiple files aggregates all types declared in those files', async () => {
      const file1Uri = vscode.Uri.file('/workspace/src/repo.ts');
      const file2Uri = vscode.Uri.file('/workspace/src/controller.ts');

      const doc1 = {
        uri: file1Uri,
        version: 1,
        getText: () => 'export class RepoA {}\nexport class RepoB {}',
      };
      const doc2 = {
        uri: file2Uri,
        version: 1,
        getText: () => 'export class ControllerA {}',
      };

      (vscode.workspace as { openTextDocument: unknown }).openTextDocument = async (uri: unknown) => {
        const u = uri as vscode.Uri;
        if (u.fsPath.includes('repo')) {
          return doc1 as unknown as vscode.TextDocument;
        }
        return doc2 as unknown as vscode.TextDocument;
      };

      const filesPane: FilesPaneConfig = createFilesPane('facet.pane.1');
      const symbolsPane: SymbolsPaneConfig = createSymbolsPane('facet.pane.2', {
        title: 'Types',
        inputSource: 'previousPane',
        tree: false,
        sort: 'name',
      });

      await manager.applyVisiblePanes([filesPane, symbolsPane]);

      // Multi-select both files
      coordinator.setSlotSelection('facet.pane.1', [file1Uri, file2Uri]);

      const types = await coordinator.getSlotChildren<FacetSymbolNode>(symbolsPane);
      assert.strictEqual(types.length, 3);
      const names = types.map((t) => t.name);
      assert.ok(names.includes('RepoA'));
      assert.ok(names.includes('RepoB'));
      assert.ok(names.includes('ControllerA'));
    });

    test('Types -> Members: selecting multiple types aggregates the union of all members', async () => {
      const typeUri = vscode.Uri.file('/workspace/src/types.ts');
      const typeA: FacetSymbolNode = {
        name: 'TypeA',
        kind: vscode.SymbolKind.Class,
        uri: typeUri,
        range: new vscode.Range(0, 0, 10, 0),
        selectionRange: new vscode.Range(0, 13, 0, 18),
        category: MemberCategory.All,
        isStatic: false,
        children: [
          {
            name: 'methodA1',
            kind: vscode.SymbolKind.Method,
            uri: typeUri,
            range: new vscode.Range(2, 2, 4, 3),
            selectionRange: new vscode.Range(2, 2, 2, 10),
            category: MemberCategory.All,
            isStatic: false,
            children: [],
          },
        ],
      };
      const typeB: FacetSymbolNode = {
        name: 'TypeB',
        kind: vscode.SymbolKind.Class,
        uri: typeUri,
        range: new vscode.Range(12, 0, 22, 0),
        selectionRange: new vscode.Range(12, 13, 12, 18),
        category: MemberCategory.All,
        isStatic: false,
        children: [
          {
            name: 'methodB1',
            kind: vscode.SymbolKind.Method,
            uri: typeUri,
            range: new vscode.Range(14, 2, 16, 3),
            selectionRange: new vscode.Range(14, 2, 14, 10),
            category: MemberCategory.All,
            isStatic: false,
            children: [],
          },
          {
            name: 'methodB2',
            kind: vscode.SymbolKind.Method,
            uri: typeUri,
            range: new vscode.Range(18, 2, 20, 3),
            selectionRange: new vscode.Range(18, 2, 18, 10),
            category: MemberCategory.All,
            isStatic: false,
            children: [],
          },
        ],
      };

      const typesPane: SymbolsPaneConfig = createSymbolsPane('facet.pane.1', {
        title: 'Types',
        inputSource: 'project',
        tree: false,
      });
      const membersPane: SymbolsPaneConfig = createSymbolsPane('facet.pane.2', {
        title: 'Members',
        inputSource: 'previousPane',
        tree: false,
        sort: 'name',
      });

      await manager.applyVisiblePanes([typesPane, membersPane]);

      // Multi-select typeA and typeB
      coordinator.setSlotSelection('facet.pane.1', [typeA, typeB]);

      const members = await coordinator.getSlotChildren<FacetSymbolNode>(membersPane);
      assert.strictEqual(members.length, 3);
      const memberNames = members.map((m) => m.name);
      assert.ok(memberNames.includes('methodA1'));
      assert.ok(memberNames.includes('methodB1'));
      assert.ok(memberNames.includes('methodB2'));
    });

    test('Members -> Relations: selecting multiple members aggregates references and definitions', async () => {
      const uri = vscode.Uri.file('/workspace/src/calc.ts');
      const method1: FacetSymbolNode = {
        name: 'add',
        kind: vscode.SymbolKind.Method,
        uri,
        range: new vscode.Range(0, 0, 5, 0),
        selectionRange: new vscode.Range(0, 2, 0, 5),
        category: MemberCategory.All,
        isStatic: false,
        children: [],
      };
      const method2: FacetSymbolNode = {
        name: 'subtract',
        kind: vscode.SymbolKind.Method,
        uri,
        range: new vscode.Range(6, 0, 10, 0),
        selectionRange: new vscode.Range(6, 2, 6, 10),
        category: MemberCategory.All,
        isStatic: false,
        children: [],
      };

      (vscode.commands as { executeCommand: unknown }).executeCommand = async (cmd: string, ...args: unknown[]) => {
        if (cmd === 'vscode.executeReferenceProvider') {
          const targetUri = args[0] as vscode.Uri;
          const pos = args[1] as vscode.Position;
          if (pos.line === 0) {
            return [{ uri: targetUri, range: new vscode.Range(20, 4, 20, 7) }];
          }
          return [
            { uri: targetUri, range: new vscode.Range(30, 4, 30, 12) },
            { uri: targetUri, range: new vscode.Range(40, 4, 40, 12) },
          ];
        }
        if (cmd === 'vscode.executeDefinitionProvider') {
          const targetUri = args[0] as vscode.Uri;
          const pos = args[1] as vscode.Position;
          return [{ uri: targetUri, range: new vscode.Range(pos.line, 2, pos.line, 10) }];
        }
        return (origExecuteCommand as (...a: unknown[]) => unknown)(cmd, ...args);
      };

      const membersPane: SymbolsPaneConfig = createSymbolsPane('facet.pane.1');
      const refPane: ReferencesPaneConfig = {
        id: 'facet.pane.2',
        role: 'references',
        title: 'References',
        visible: true,
        inputSource: 'previousPane',
        sort: 'position',
        filters: createDefaultFilters(),
      };
      const defPane: DefinitionsPaneConfig = {
        id: 'facet.pane.2',
        role: 'definitions',
        title: 'Definitions',
        visible: true,
        inputSource: 'previousPane',
        sort: 'position',
        filters: createDefaultFilters(),
      };

      // Test references with multi-selection from membersPane
      await manager.applyVisiblePanes([membersPane, refPane]);
      coordinator.setSlotSelection('facet.pane.1', [method1, method2]);

      const references = await coordinator.getSlotChildren(refPane);
      // 1 ref for add + 2 refs for subtract = 3 total references
      assert.strictEqual(references.length, 3);

      // Test definitions with multi-selection from membersPane
      await manager.applyVisiblePanes([membersPane, defPane]);
      coordinator.setSlotSelection('facet.pane.1', [method1, method2]);

      const definitions = await coordinator.getSlotChildren(defPane);
      // 1 def for add + 1 def for subtract = 2 total definitions
      assert.strictEqual(definitions.length, 2);
    });
  });
});
