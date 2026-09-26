import * as assert from 'assert';
import * as vscode from 'vscode';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { CategoriesTreeProvider } from '../../providers/categoriesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SlotTreeProvider } from '../../providers/slotTreeProvider';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';

suite('PanePipelineManager & SlotTreeProvider Test Suite', () => {
  const dummyUri = vscode.Uri.file('/path/to/test.ts');
  const dummyRange = new vscode.Range(0, 0, 0, 0);

  const mockClass: FacetSymbolNode = {
    name: 'PipelineTestClass',
    kind: vscode.SymbolKind.Class,
    uri: dummyUri,
    range: dummyRange,
    selectionRange: dummyRange,
    category: MemberCategory.All,
    isStatic: false,
    children: [
      {
        name: 'testMethod',
        kind: vscode.SymbolKind.Method,
        uri: dummyUri,
        range: dummyRange,
        selectionRange: dummyRange,
        category: MemberCategory.InstanceMethods,
        isStatic: false,
        children: []
      }
    ]
  };

  test('PanePipelineManager initializes with default 4 visible panes', () => {
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

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getPanes().length, 6);
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    coordinator.dispose();
  });

  test('PanePipelineManager removes and moves panes', () => {
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

    const manager = new PanePipelineManager(coordinator);

    // Move pane down
    const p1TitleBefore = manager.getVisiblePanes()[0].title;
    const p2TitleBefore = manager.getVisiblePanes()[1].title;
    manager.movePane('facet.pane.1', 'down');
    assert.strictEqual(manager.getVisiblePanes()[0].title, p2TitleBefore);
    assert.strictEqual(manager.getVisiblePanes()[1].title, p1TitleBefore);

    // Remove pane
    assert.strictEqual(manager.getVisiblePanes().length, 4);
    const removed = manager.removePane('facet.pane.4');
    assert.ok(removed);
    assert.strictEqual(manager.getVisiblePanes().length, 3);

    coordinator.dispose();
  });

  test('SlotTreeProvider delegates to appropriate provider according to pane role', () => {
    const typesProvider = new TypesTreeProvider();
    const categoriesProvider = new CategoriesTreeProvider();
    const membersProvider = new MembersTreeProvider();
    const relationsProvider = new RelationsTreeProvider();

    typesProvider.setSymbols([mockClass]);
    membersProvider.setSelectedTypes([mockClass]);

    const slotConfig: import('../../models/paneConfig').PaneConfig = {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      scope: 'file',
      side: 'instance',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'references',
      visible: true
    };

    const slotProvider = new SlotTreeProvider(
      slotConfig,
      typesProvider,
      categoriesProvider,
      membersProvider,
      relationsProvider
    );

    // Initially role is types
    let children = slotProvider.getChildren() as FacetSymbolNode[];
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'PipelineTestClass');

    // Reconfigure role to members on the fly
    slotConfig.role = 'members';
    children = slotProvider.getChildren() as FacetSymbolNode[];
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'testMethod');

    // Reconfigure role to categories on the fly
    slotConfig.role = 'categories';
    const catChildren = slotProvider.getChildren() as any[];
    assert.ok(catChildren.length >= 5);
  });
});
