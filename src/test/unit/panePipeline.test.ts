import * as assert from 'assert';
import * as vscode from 'vscode';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SlotTreeProvider } from '../../providers/slotTreeProvider';
import { FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import { PaneConfig, createDefaultFilters, createMembersPane, createTypesPane } from '../../models/paneConfig';

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

  test('PanePipelineManager initializes with default 3 visible panes', () => {
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

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getPanes().length, 6);
    assert.strictEqual(manager.getVisiblePanes().length, 3);
    assert.strictEqual(manager.getVisiblePanes()[0].inputSource, 'project');
    assert.strictEqual(manager.getVisiblePanes()[0].role, 'types');

    coordinator.dispose();
  });

  test('PanePipelineManager removes panes and enforces minimum 1 visible pane', async () => {
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

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getVisiblePanes().length, 3);

    // Remove pane 3
    const removed3 = await manager.removePane('facet.pane.3');
    assert.ok(removed3);
    assert.strictEqual(manager.getVisiblePanes().length, 2);

    // Remove pane 2
    const removed2 = await manager.removePane('facet.pane.2');
    assert.ok(removed2);
    assert.strictEqual(manager.getVisiblePanes().length, 1);

    // Cannot remove the last pane
    const removedLast = await manager.removePane('facet.pane.1');
    assert.strictEqual(removedLast, false);
    assert.strictEqual(manager.getVisiblePanes().length, 1);

    coordinator.dispose();
  });

  test('PanePipelineManager adds panes to end and respects max 6 slots', async () => {
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

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getVisiblePanes().length, 3);

    // Add Callers to end
    const added1 = await manager.addPaneToEnd('callers');
    assert.ok(added1);
    assert.strictEqual(manager.getVisiblePanes().length, 4);
    assert.strictEqual(manager.getVisiblePanes()[3].role, 'callers');
    assert.strictEqual(manager.getVisiblePanes()[3].id, 'facet.pane.4');

    // Add Files to end
    const added2 = await manager.addPaneToEnd('files');
    assert.ok(added2);
    assert.strictEqual(manager.getVisiblePanes().length, 5);
    assert.strictEqual(manager.getVisiblePanes()[4].role, 'files');

    // Add Hierarchy to end
    const added3 = await manager.addPaneToEnd('hierarchy');
    assert.ok(added3);
    assert.strictEqual(manager.getVisiblePanes().length, 6);

    // Cannot add beyond 6
    const addedOverflow = await manager.addPaneToEnd('members');
    assert.strictEqual(addedOverflow, undefined);
    assert.strictEqual(manager.getVisiblePanes().length, 6);

    coordinator.dispose();
  });

  test('PanePipelineManager delete preserves slot ordering and upstream chaining', async () => {
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

    const manager = new PanePipelineManager(coordinator);
    // Initial visible: [pane.1 (types), pane.2 (members), pane.3 (references)]

    // Delete pane.1 (Types)
    await manager.removePane('facet.pane.1');

    const visibleAfter = manager.getVisiblePanes();
    assert.strictEqual(visibleAfter.length, 2);
    // Remaining panes shifted into slot 1 and 2
    assert.strictEqual(visibleAfter[0].id, 'facet.pane.1');
    assert.strictEqual(visibleAfter[0].role, 'members');
    assert.strictEqual(visibleAfter[1].id, 'facet.pane.2');
    assert.strictEqual(visibleAfter[1].role, 'references');

    // Upstream chaining is strictly relative to previous visible pane
    const upstream = coordinator.getPreviousPane('facet.pane.2');
    assert.strictEqual(upstream?.id, 'facet.pane.1');
    assert.strictEqual(upstream?.role, 'members');

    // First pane has no previous pane
    const upstreamFirst = coordinator.getPreviousPane('facet.pane.1');
    assert.strictEqual(upstreamFirst, undefined);

    coordinator.dispose();
  });

  test('FacetCoordinator resolves upstream pane strictly relative to preceding visible pane', async () => {
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

    const manager = new PanePipelineManager(coordinator);
    // Add Files pane to end
    await manager.addPaneToEnd('files');
    // Current visible: [pane.1 (types), pane.2 (members), pane.3 (references), pane.4 (files)]

    // pane.1 has no previous pane
    assert.strictEqual(coordinator.getPreviousPane('facet.pane.1'), undefined);

    // pane.2 upstream is pane.1
    const upstreamForMembers = coordinator.getPreviousPane('facet.pane.2');
    assert.strictEqual(upstreamForMembers?.id, 'facet.pane.1');

    // pane.3 upstream is pane.2
    const upstreamForReferences = coordinator.getPreviousPane('facet.pane.3');
    assert.strictEqual(upstreamForReferences?.id, 'facet.pane.2');

    // pane.4 upstream is pane.3
    const upstreamForFiles = coordinator.getPreviousPane('facet.pane.4');
    assert.strictEqual(upstreamForFiles?.id, 'facet.pane.3');

    coordinator.dispose();
  });
});

