import * as assert from 'assert';
import * as vscode from 'vscode';
import { SymbolResolver } from '../../services/symbolResolver';
import { MemberCategory, filterMembers, unionMembers, FacetSymbolNode } from '../../models/symbolNode';

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

  test('filterMembers filters by category', () => {
    const members: FacetSymbolNode[] = [
      {
        name: 'instMethod',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: new vscode.Range(0, 0, 0, 0),
        selectionRange: new vscode.Range(0, 0, 0, 0),
        category: MemberCategory.InstanceMethods,
        isStatic: false,
        children: []
      },
      {
        name: 'staticMethod',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: new vscode.Range(1, 0, 1, 0),
        selectionRange: new vscode.Range(1, 0, 1, 0),
        category: MemberCategory.StaticMethods,
        isStatic: true,
        children: []
      }
    ];

    const allMembers = filterMembers(members, MemberCategory.All);
    assert.strictEqual(allMembers.length, 2);

    const methodsOnly = filterMembers(members, MemberCategory.InstanceMethods);
    assert.strictEqual(methodsOnly.length, 1);
    assert.strictEqual(methodsOnly[0].name, 'instMethod');

    const catFiltered = filterMembers(members, MemberCategory.StaticMethods);
    assert.strictEqual(catFiltered.length, 1);
    assert.strictEqual(catFiltered[0].name, 'staticMethod');
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
          children: []
        },
        {
          name: 'onlyInA',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(2, 0, 2, 0),
          selectionRange: new vscode.Range(2, 0, 2, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: []
        }
      ]
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
          children: []
        },
        {
          name: 'onlyInB',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: new vscode.Range(5, 0, 5, 0),
          selectionRange: new vscode.Range(5, 0, 5, 0),
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: []
        }
      ]
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
    const { matchesPaneFilters } = require('../../models/paneConfig');
    const classNode: FacetSymbolNode = {
      name: 'TestClass',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: []
    };
    const methodNode: FacetSymbolNode = {
      name: 'testMethod',
      kind: vscode.SymbolKind.Method,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.InstanceMethods,
      isStatic: false,
      children: []
    };

    assert.strictEqual(matchesPaneFilters(classNode, { class: true }), true);
    assert.strictEqual(matchesPaneFilters(classNode, { class: false }), false);

    assert.strictEqual(matchesPaneFilters(methodNode, { method: true }), true);
    assert.strictEqual(matchesPaneFilters(methodNode, { method: false }), false);
  });

  test('extractSuperTypes correctly parses extends without mixing implements for classes', () => {
    const { extractSuperTypes, extractTypeHeader } = require('../../models/symbolNode');

    // Class with extends and implements: only extends (Animal) is parsed!
    assert.deepStrictEqual(
      extractSuperTypes('export class Dog extends Animal implements IPet, ICanRun {', false),
      ['Animal']
    );

    // Interface with extends: all super interfaces are parsed
    assert.deepStrictEqual(
      extractSuperTypes('interface Cat extends Animal, Domesticated {', true),
      ['Animal', 'Domesticated']
    );

    // Python inheritance
    assert.deepStrictEqual(
      extractSuperTypes('class Dog(Animal, CanRun):', false),
      ['Animal', 'CanRun']
    );

    // C# class with base class and interface: only base class is parsed
    assert.deepStrictEqual(
      extractSuperTypes('public class Dog : Animal, IPet', false),
      ['Animal']
    );

    // Multi-line header extraction
    const multiLine = [
      'export class Dog',
      '  extends Animal',
      '  implements IPet {',
      '  name: string;'
    ];
    const header = extractTypeHeader(multiLine, 0);
    assert.strictEqual(header, 'export class Dog extends Animal implements IPet {');
    assert.deepStrictEqual(extractSuperTypes(header, false), ['Animal']);
  });

  test('buildTypeHierarchy nests subtypes, excludes them from roots, and never mixes interfaces', () => {
    const { buildTypeHierarchy } = require('../../models/symbolNode');

    const animal: FacetSymbolNode = {
      name: 'Animal',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: new vscode.Range(0, 0, 0, 0),
      selectionRange: new vscode.Range(0, 0, 0, 0),
      category: MemberCategory.All,
      isStatic: false,
      children: [],
      superTypes: []
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
      superTypes: ['Animal', 'IPet'] // Includes an interface to test interface guard
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
      superTypes: ['Dog']
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
      superTypes: []
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
      superTypes: []
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
});
