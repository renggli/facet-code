import * as assert from 'assert';
import * as vscode from 'vscode';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SlotTreeProvider } from '../../providers/slotTreeProvider';
import { FacetSymbolNode, MemberCategory } from '../../models/symbolNode';
import { window } from './mockVscode';

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

  test('PanePipelineManager initializes with default 4 visible panes (Project Browser preset)', () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getPanes().length, 6);
    assert.strictEqual(manager.getVisiblePanes().length, 4);
    assert.strictEqual(manager.getVisiblePanes()[0].inputSource, 'project');
    assert.strictEqual(manager.getVisiblePanes()[0].role, 'directories');
    assert.strictEqual(manager.getVisiblePanes()[1].role, 'files');
    assert.strictEqual(manager.getVisiblePanes()[2].role, 'types');
    assert.strictEqual(manager.getVisiblePanes()[3].role, 'members');

    coordinator.dispose();
  });

  test('PanePipelineManager removes panes and enforces minimum 1 visible pane', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    // Remove pane 4
    const removed4 = await manager.removePane('facet.pane.4');
    assert.ok(removed4);
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
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    // Add Callers to end
    const added1 = await manager.addPaneToEnd('callers');
    assert.ok(added1);
    assert.strictEqual(manager.getVisiblePanes().length, 5);
    assert.strictEqual(manager.getVisiblePanes()[4].role, 'callers');
    assert.strictEqual(manager.getVisiblePanes()[4].id, 'facet.pane.5');

    // Add Definitions to end
    const added2 = await manager.addPaneToEnd('definitions');
    assert.ok(added2);
    assert.strictEqual(manager.getVisiblePanes().length, 6);
    assert.strictEqual(manager.getVisiblePanes()[5].role, 'definitions');

    // Cannot add beyond 6
    const addedOverflow = await manager.addPaneToEnd('members');
    assert.strictEqual(addedOverflow, undefined);
    assert.strictEqual(manager.getVisiblePanes().length, 6);

    coordinator.dispose();
  });

  test('PanePipelineManager delete preserves slot ordering and upstream chaining', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);
    // Initial visible: [pane.1 (directories), pane.2 (files), pane.3 (types), pane.4 (members)]

    // Delete pane.1 (Directories)
    await manager.removePane('facet.pane.1');

    const visibleAfter = manager.getVisiblePanes();
    assert.strictEqual(visibleAfter.length, 3);
    // Remaining panes shifted into slot 1, 2, 3
    assert.strictEqual(visibleAfter[0].id, 'facet.pane.1');
    assert.strictEqual(visibleAfter[0].role, 'files');
    assert.strictEqual(visibleAfter[1].id, 'facet.pane.2');
    assert.strictEqual(visibleAfter[1].role, 'types');
    assert.strictEqual(visibleAfter[2].id, 'facet.pane.3');
    assert.strictEqual(visibleAfter[2].role, 'members');

    // Upstream chaining is strictly relative to previous visible pane
    const upstream = coordinator.getPreviousPane('facet.pane.2');
    assert.strictEqual(upstream?.id, 'facet.pane.1');
    assert.strictEqual(upstream?.role, 'files');

    // First pane has no previous pane
    const upstreamFirst = coordinator.getPreviousPane('facet.pane.1');
    assert.strictEqual(upstreamFirst, undefined);

    coordinator.dispose();
  });

  test('FacetCoordinator resolves upstream pane strictly relative to preceding visible pane', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);

    const manager = new PanePipelineManager(coordinator);
    // Initial visible: [pane.1 (directories), pane.2 (files), pane.3 (types), pane.4 (members)]
    // Add Callers pane to end
    await manager.addPaneToEnd('callers');
    // Current visible: [pane.1 (directories), pane.2 (files), pane.3 (types), pane.4 (members), pane.5 (callers)]

    // pane.1 has no previous pane
    assert.strictEqual(coordinator.getPreviousPane('facet.pane.1'), undefined);

    // pane.2 upstream is pane.1
    const upstreamForFiles = coordinator.getPreviousPane('facet.pane.2');
    assert.strictEqual(upstreamForFiles?.id, 'facet.pane.1');

    // pane.3 upstream is pane.2
    const upstreamForTypes = coordinator.getPreviousPane('facet.pane.3');
    assert.strictEqual(upstreamForTypes?.id, 'facet.pane.2');

    // pane.4 upstream is pane.3
    const upstreamForMembers = coordinator.getPreviousPane('facet.pane.4');
    assert.strictEqual(upstreamForMembers?.id, 'facet.pane.3');

    // pane.5 upstream is pane.4
    const upstreamForCallers = coordinator.getPreviousPane('facet.pane.5');
    assert.strictEqual(upstreamForCallers?.id, 'facet.pane.4');

    coordinator.dispose();
  });

  test('PanePipelineManager configurePane executes title, role, input, selection, filter, sort, and display actions', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // 1. Edit title
    window.pushQuickPick({ action: 'title' });
    window.pushInputBox('Custom Directories Title');
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.title, 'Custom Directories Title');

    // 2. Change role to Problems
    window.pushQuickPick({ action: 'type' });
    window.pushQuickPick({ role: 'problems' });
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.role, 'problems');

    // 3. Change input source to openEditors
    window.pushQuickPick({ action: 'input' });
    window.pushQuickPick({ source: 'openEditors' });
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.inputSource, 'openEditors');

    // 4. Change selection source to none
    window.pushQuickPick({ action: 'selectionSource' });
    window.pushQuickPick({ source: 'none' });
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.selectionSource, 'none');

    // 5. Change sort to name
    window.pushQuickPick({ action: 'sort' });
    window.pushQuickPick({ sort: 'name' });
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.sort, 'name');

    // 6. Test Glob pattern filter for files pane
    window.pushQuickPick({ action: 'globPattern' });
    window.pushInputBox('src/**/*.ts');
    await manager.configurePane('facet.pane.2');
    const pane2 = manager.getPane('facet.pane.2') as any;
    assert.strictEqual(pane2?.globPattern, 'src/**/*.ts');

    // 7. Test Symbol kinds filter for types pane
    window.pushQuickPick({ action: 'filters' });
    window.pushQuickPick([{ key: 'class', label: 'Class', picked: true }]);
    await manager.configurePane('facet.pane.3');
    const pane3 = manager.getPane('facet.pane.3') as any;
    assert.strictEqual(pane3?.filters?.class, true);

    // 8. Test Display mode toggle
    window.pushQuickPick({ action: 'display' });
    window.pushQuickPick({ mode: 'flat' });
    await manager.configurePane('facet.pane.3');
    assert.strictEqual((manager.getPane('facet.pane.3') as any)?.display, 'flat');

    // 9. Test Add Pane action from menu
    window.pushQuickPick({ action: 'addEnd' });
    window.pushQuickPick({ role: 'callers' });
    await manager.configurePane('facet.pane.1');
    assert.strictEqual(manager.getVisiblePanes().length, 5);
    assert.strictEqual(manager.getVisiblePanes()[4].role, 'callers');

    // 10. Test Remove Pane action from menu
    window.pushQuickPick({ action: 'remove' });
    await manager.configurePane('facet.pane.5');
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    coordinator.dispose();
  });

  test('PanePipelineManager applyPreset configures all presets correctly', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // Apply Implementors preset
    await manager.applyPreset('Implementors');
    let visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'types');
    assert.strictEqual(visible[1].role, 'members');
    assert.strictEqual(visible[2].role, 'implementations');

    // Apply Callers preset
    await manager.applyPreset('Callers');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'types');
    assert.strictEqual(visible[1].role, 'members');
    assert.strictEqual(visible[2].role, 'callers');

    // Apply References preset
    await manager.applyPreset('References');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'types');
    assert.strictEqual(visible[1].role, 'members');
    assert.strictEqual(visible[2].role, 'references');

    // Apply Project Browser preset
    await manager.applyPreset('Project Browser');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 4);
    assert.strictEqual(visible[0].role, 'directories');
    assert.strictEqual(visible[1].role, 'files');
    assert.strictEqual(visible[2].role, 'types');
    assert.strictEqual(visible[3].role, 'members');

    coordinator.dispose();
  });

  test('SlotTreeProvider delegates to FacetCoordinator correctly', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // Provider by slotId string
    const provider1 = new SlotTreeProvider('facet.pane.1', coordinator);
    assert.ok(provider1.config);
    assert.strictEqual(provider1.slotId, 'facet.pane.1');

    // Refresh fires event
    let refreshed = false;
    provider1.onDidChangeTreeData(() => {
      refreshed = true;
    });
    provider1.refresh();
    assert.ok(refreshed);

    // getChildren returns array
    const children = await provider1.getChildren();
    assert.ok(Array.isArray(children));

    // Provider with unknown slot returns empty defaults
    const unknownProvider = new SlotTreeProvider('facet.pane.unknown', coordinator);
    assert.strictEqual(unknownProvider.config, undefined);
    assert.strictEqual(await unknownProvider.getChildren().then((c: any[]) => c.length), 0);
    assert.strictEqual(unknownProvider.getParent({}), undefined);
    assert.strictEqual(unknownProvider.getTreeItem({}).label, '');

    // Provider with explicit config
    const explicitConfig = manager.getPanes()[0];
    const explicitProvider = new SlotTreeProvider(explicitConfig, coordinator);
    assert.strictEqual(explicitProvider.config?.id, explicitConfig.id);

    coordinator.dispose();
  });
});
