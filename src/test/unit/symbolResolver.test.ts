import * as assert from 'assert';
import * as vscode from 'vscode';
import { matchesPaneFilters } from '../../models/paneConfig';
import {
  buildTypeHierarchy,
  extractSuperTypes,
  extractTypeHeader,
  type FacetSymbolNode,
  MemberCategory,
  unionMembers,
} from '../../models/symbolNode';
import { SymbolResolver } from '../../services/symbolResolver';
import { commands } from './mockVscode';

suite('SymbolResolver & Models Test Suite', () => {
  const resolver = new SymbolResolver();
  const dummyUri = vscode.Uri.file('/path/to/test.ts');

  test('categorize maps kinds and details accurately', () => {
    const constRes = resolver.categorize(vscode.SymbolKind.Constant);
    assert.strictEqual(constRes.category, MemberCategory.Constants);
    assert.strictEqual(constRes.isStatic, true);

    const instMethodRes = resolver.categorize(vscode.SymbolKind.Method);
    assert.strictEqual(instMethodRes.category, MemberCategory.InstanceMethods);
    assert.strictEqual(instMethodRes.isStatic, false);

    const staticMethodRes = resolver.categorize(vscode.SymbolKind.Method, 'static run(): void');
    assert.strictEqual(staticMethodRes.category, MemberCategory.StaticMethods);
    assert.strictEqual(staticMethodRes.isStatic, true);

    const ctorRes = resolver.categorize(vscode.SymbolKind.Constructor);
    assert.strictEqual(ctorRes.category, MemberCategory.Constructors);
    assert.strictEqual(ctorRes.isStatic, false);

    const getterRes = resolver.categorize(vscode.SymbolKind.Property, 'get count(): number');
    assert.strictEqual(getterRes.category, MemberCategory.Accessors);
  });

  test('fallbackParse correctly extracts classes and methods from source text', () => {
    const code = `
export class Calculator {
  public value: number;
  constructor() {}
  public calculate(): number {
    return 42;
  }
  public static parse(raw: string): Calculator {
    return new Calculator();
  }
}
`;
    const nodes = resolver.fallbackParse(code, dummyUri);
    assert.strictEqual(nodes.length, 1);
    const cls = nodes[0];
    assert.strictEqual(cls.name, 'Calculator');
    assert.strictEqual(cls.kind, vscode.SymbolKind.Class);
    assert.strictEqual(cls.children.length, 4);

    const names = cls.children.map((c) => c.name);
    assert.ok(names.includes('value'));
    assert.ok(names.includes('constructor'));
    assert.ok(names.includes('calculate'));
    assert.ok(names.includes('parse'));

    const parseMethod = cls.children.find((c) => c.name === 'parse')!;
    assert.strictEqual(parseMethod.isStatic, true);
    assert.strictEqual(parseMethod.category, MemberCategory.StaticMethods);

    const calcMethod = cls.children.find((c) => c.name === 'calculate')!;
    assert.strictEqual(calcMethod.isStatic, false);
    assert.strictEqual(calcMethod.category, MemberCategory.InstanceMethods);
  });

  test('unionMembers computes deduplicated union across multiple types', () => {
    const typeA: FacetSymbolNode = {
      name: 'ClassA',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [
        {
          name: 'commonMethod',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(1, 0, 1, 0),
          selectionRange: new vscode.Range(1, 0, 1, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: [],
        },
        {
          name: 'onlyInA',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(2, 0, 2, 0),
          selectionRange: new vscode.Range(2, 0, 2, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: [],
        },
      ],
    };

    const typeB: FacetSymbolNode = {
      name: 'ClassB',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(3, 0, 3, 0),
      selectionRange: new vscode.Range(3, 0, 3, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [
        {
          name: 'commonMethod',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(4, 0, 4, 0),
          selectionRange: new vscode.Range(4, 0, 4, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: [],
        },
        {
          name: 'onlyInB',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(5, 0, 5, 0),
          selectionRange: new vscode.Range(5, 0, 5, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: [],
        },
      ],
    };

    const union = unionMembers([typeA, typeB]);
    assert.strictEqual(union.length, 3);
    const names = union.map((m) => m.name);
    assert.ok(names.includes('commonMethod'));
    assert.ok(names.includes('onlyInA'));
    assert.ok(names.includes('onlyInB'));
  });

  test('resolveWorkspaceTypes returns type nodes safely', async () => {
    const types = await resolver.resolveWorkspaceTypes('');
    assert.ok(Array.isArray(types));
  });

  test('matchesPaneFilters selectively filters types and members', () => {
    const classNode: FacetSymbolNode = {
      name: 'TestClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
    };
    const methodNode: FacetSymbolNode = {
      name: 'testMethod',
      kind: vscode.SymbolKind.Method,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: [],
    };

    assert.strictEqual(matchesPaneFilters(classNode, { class: true }), true);
    assert.strictEqual(matchesPaneFilters(classNode, { class: false }), false);

    assert.strictEqual(matchesPaneFilters(methodNode, { method: true }), true);
    assert.strictEqual(matchesPaneFilters(methodNode, { method: false }), false);
  });

  test('extractSuperTypes correctly parses extends without mixing implements for classes', () => {
    // Class with extends and implements: only extends (Animal) is parsed!
    assert.deepStrictEqual(extractSuperTypes('export class Dog extends Animal implements IPet, ICanRun {', false), [
      'Animal',
    ]);

    // Interface with extends: all super interfaces are parsed
    assert.deepStrictEqual(extractSuperTypes('interface Cat extends Animal, Domesticated {', true), [
      'Animal',
      'Domesticated',
    ]);

    // Python inheritance
    assert.deepStrictEqual(extractSuperTypes('class Dog(Animal, CanRun):', false), ['Animal', 'CanRun']);

    // C# class with base class and interface: only base class is parsed
    assert.deepStrictEqual(extractSuperTypes('public class Dog : Animal, IPet', false), ['Animal']);

    // Multi-line header extraction
    const multiLine = ['export class Dog', '  extends Animal', '  implements IPet {', '  name: string;'];
    const header = extractTypeHeader(multiLine, 0);
    assert.strictEqual(header, 'export class Dog extends Animal implements IPet {');
    assert.deepStrictEqual(extractSuperTypes(header, false), ['Animal']);
  });

  test('buildTypeHierarchy nests subtypes, excludes them from roots, and never mixes interfaces', () => {
    const animal: FacetSymbolNode = {
      name: 'Animal',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const dog: FacetSymbolNode = {
      name: 'Dog',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(1, 0, 1, 0),
      selectionRange: new vscode.Range(1, 0, 1, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['Animal', 'IPet'], // Includes an interface to test interface guard
    };

    const goldenRetriever: FacetSymbolNode = {
      name: 'GoldenRetriever',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(2, 0, 2, 0),
      selectionRange: new vscode.Range(2, 0, 2, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['Dog'],
    };

    const petInterface: FacetSymbolNode = {
      name: 'IPet',
      kind: vscode.SymbolKind.Interface,
      uri: dummyUri,
      range: new vscode.Range(3, 0, 3, 0),
      selectionRange: new vscode.Range(3, 0, 3, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const standalone: FacetSymbolNode = {
      name: 'StandaloneClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(4, 0, 4, 0),
      selectionRange: new vscode.Range(4, 0, 4, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const roots = buildTypeHierarchy([animal, dog, goldenRetriever, petInterface, standalone]);

    // Animal, IPet, and StandaloneClass are roots. Dog and GoldenRetriever are nested
    assert.strictEqual(roots.length, 3);
    const rootNames = roots.map((r: FacetSymbolNode) => r.name);
    assert.ok(rootNames.includes('Animal'));
    assert.ok(rootNames.includes('IPet'));
    assert.ok(rootNames.includes('StandaloneClass'));
    assert.ok(!rootNames.includes('Dog'));
    assert.ok(!rootNames.includes('GoldenRetriever'));

    // Animal has Dog as subType
    assert.strictEqual(animal.subTypes?.length, 1);
    assert.strictEqual(animal.subTypes[0].name, 'Dog');

    // Dog has GoldenRetriever as subType
    assert.strictEqual(dog.subTypes?.length, 1);
    assert.strictEqual(dog.subTypes[0].name, 'GoldenRetriever');

    // IPet does NOT have Dog as subType (interface must not mix in classes)
    assert.strictEqual(petInterface.subTypes?.length || 0, 0);
  });

  test('resolveWorkspaceTypes queries workspace symbols and maps correctly', async () => {
    commands.setHandler('vscode.executeWorkspaceSymbolProvider', (_query: string) => [
      {
        name: 'OrderController',
        containerName: 'Controllers',
        kind: vscode.SymbolKind.Class,
        location: { uri: dummyUri, range: new vscode.Range(0, 0, 10, 0) },
      },
      {
        name: 'nonTypeVariable',
        containerName: 'Controllers',
        kind: vscode.SymbolKind.Variable,
        location: { uri: dummyUri, range: new vscode.Range(12, 0, 12, 10) },
      },
    ]);

    const results = await resolver.resolveWorkspaceTypes('Order');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'OrderController');
    assert.strictEqual(results[0].detail, 'Controllers');

    commands.clearHandlers();
  });

  test('resolveWorkspaceTypes falls back to scanning files when workspace symbols empty', async () => {
    commands.setHandler('vscode.executeWorkspaceSymbolProvider', () => []);

    const origFindFiles = vscode.workspace.findFiles;
    const origOpenTextDocument = vscode.workspace.openTextDocument;

    const testFileUri = vscode.Uri.file('/workspace/src/models.ts');
    (vscode.workspace as any).findFiles = async () => [testFileUri];
    (vscode.workspace as any).openTextDocument = async () => ({
      uri: testFileUri,
      version: 1,
      getText: () => 'export class CustomerModel { id: string; }',
    });

    const types = await resolver.resolveWorkspaceTypes();
    assert.strictEqual(types.length, 1);
    assert.strictEqual(types[0].name, 'CustomerModel');

    (vscode.workspace as any).findFiles = origFindFiles;
    (vscode.workspace as any).openTextDocument = origOpenTextDocument;
    commands.clearHandlers();
  });

  test('resolveDocumentSymbols handles Tier 1 (DocumentSymbol) and Tier 2 (SymbolInformation)', async () => {
    const testDoc = {
      uri: dummyUri,
      version: 1,
      getText: () => '',
    };

    // Tier 1: DocumentSymbol hierarchy
    commands.setHandler('vscode.executeDocumentSymbolProvider', () => [
      {
        name: 'MyTier1Class',
        detail: 'detail',
        kind: vscode.SymbolKind.Class,
        range: new vscode.Range(0, 0, 10, 0),
        selectionRange: new vscode.Range(0, 6, 0, 18),
        children: [
          {
            name: 'myMethod',
            detail: '() => void',
            kind: vscode.SymbolKind.Method,
            range: new vscode.Range(2, 2, 4, 3),
            selectionRange: new vscode.Range(2, 2, 2, 10),
            children: [],
          },
        ],
      },
    ]);

    const tier1Nodes = await resolver.resolveDocumentSymbols(testDoc as any);
    assert.strictEqual(tier1Nodes.length, 1);
    assert.strictEqual(tier1Nodes[0].name, 'MyTier1Class');
    assert.strictEqual(tier1Nodes[0].children.length, 1);
    assert.strictEqual(tier1Nodes[0].children[0].name, 'myMethod');

    // Tier 2: Flat SymbolInformation with containerName
    const testDoc2 = {
      uri: vscode.Uri.file('/path/to/test2.ts'),
      version: 1,
      getText: () => '',
    };

    commands.setHandler('vscode.executeDocumentSymbolProvider', () => [
      {
        name: 'MyTier2Class',
        containerName: '',
        kind: vscode.SymbolKind.Class,
        location: { uri: testDoc2.uri, range: new vscode.Range(0, 0, 10, 0) },
      },
      {
        name: 'myMethod2',
        containerName: 'MyTier2Class',
        kind: vscode.SymbolKind.Method,
        location: { uri: testDoc2.uri, range: new vscode.Range(2, 2, 4, 3) },
      },
    ]);

    const tier2Nodes = await resolver.resolveDocumentSymbols(testDoc2 as any);
    assert.strictEqual(tier2Nodes.length, 1);
    assert.strictEqual(tier2Nodes[0].name, 'MyTier2Class');
    assert.strictEqual(tier2Nodes[0].children.length, 1);
    assert.strictEqual(tier2Nodes[0].children[0].name, 'myMethod2');

    commands.clearHandlers();
  });

  test('buildTypeHierarchy respects allowedSubclassKinds filter', () => {
    const baseClass: FacetSymbolNode = {
      name: 'Base',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const subStruct: FacetSymbolNode = {
      name: 'SubStruct',
      kind: vscode.SymbolKind.Struct,
      uri: dummyUri,
      range: new vscode.Range(1, 0, 1, 0),
      selectionRange: new vscode.Range(1, 0, 1, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['Base'],
    };

    // When only Class is allowed as subclass, SubStruct is not linked as subtype
    buildTypeHierarchy([baseClass, subStruct], [vscode.SymbolKind.Class]);
    assert.strictEqual(baseClass.subTypes?.length ?? 0, 0);

    // When Struct is allowed, SubStruct is linked
    buildTypeHierarchy([baseClass, subStruct], [vscode.SymbolKind.Class, vscode.SymbolKind.Struct]);
    assert.strictEqual(baseClass.subTypes?.length, 1);
    assert.strictEqual(baseClass.subTypes[0].name, 'SubStruct');
  });

  test('buildTypeHierarchy filters based on leaves and removes duplicates nested elsewhere', () => {
    const uri1 = vscode.Uri.file('/workspace/src/base.ts');
    const uri2 = vscode.Uri.file('/workspace/src/middle.ts');
    const uri3 = vscode.Uri.file('/workspace/src/leaf.ts');
    const uri4 = vscode.Uri.file('/workspace/src/leaf_dup.ts');

    const baseClass: FacetSymbolNode = {
      name: 'BaseClass',
      kind: vscode.SymbolKind.Class,
      uri: uri1,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    const middleClass: FacetSymbolNode = {
      name: 'MiddleClass',
      kind: vscode.SymbolKind.Class,
      uri: uri2,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['BaseClass'],
    };

    const duplicateMiddle: FacetSymbolNode = {
      name: 'MiddleClass',
      kind: vscode.SymbolKind.Class,
      uri: uri2,
      range: new vscode.Range(10, 0, 10, 0),
      selectionRange: new vscode.Range(10, 0, 10, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['BaseClass'],
    };

    const leafClass: FacetSymbolNode = {
      name: 'LeafClass',
      kind: vscode.SymbolKind.Class,
      uri: uri3,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['MiddleClass'],
    };

    const duplicateLeafClass: FacetSymbolNode = {
      name: 'LeafClass',
      kind: vscode.SymbolKind.Class,
      uri: uri4,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['MiddleClass'],
    };

    const deadLeafStruct: FacetSymbolNode = {
      name: 'DeadLeaf',
      kind: vscode.SymbolKind.Struct,
      uri: uri1,
      range: new vscode.Range(5, 0, 5, 0),
      selectionRange: new vscode.Range(5, 0, 5, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: ['BaseClass'],
    };

    const standaloneStruct: FacetSymbolNode = {
      name: 'StandaloneStruct',
      kind: vscode.SymbolKind.Struct,
      uri: uri1,
      range: new vscode.Range(20, 0, 20, 0),
      selectionRange: new vscode.Range(20, 0, 20, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: [],
    };

    // Filter that only enables class, disabling struct
    const filters = {
      class: true,
      struct: false,
    };

    const roots = buildTypeHierarchy(
      [baseClass, middleClass, duplicateMiddle, leafClass, duplicateLeafClass, deadLeafStruct, standaloneStruct],
      undefined,
      filters,
    );

    // Only BaseClass should be a root:
    // - StandaloneStruct has no matching leaves and is struct -> pruned
    // - DeadLeaf is a struct leaf -> pruned
    // - MiddleClass and LeafClass are nested -> removed from roots
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(roots[0].name, 'BaseClass');

    // BaseClass retains MiddleClass (as ancestor of matching LeafClass), but prunes DeadLeaf
    assert.strictEqual(roots[0].subTypes?.length, 1);
    assert.strictEqual(roots[0].subTypes![0].name, 'MiddleClass');

    // MiddleClass contains exactly 1 LeafClass (duplicates deduplicated)
    assert.strictEqual(roots[0].subTypes![0].subTypes?.length, 1);
    assert.strictEqual(roots[0].subTypes![0].subTypes![0].name, 'LeafClass');
  });
});
