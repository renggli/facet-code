import * as assert from 'assert';
import * as vscode from 'vscode';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { SymbolResolver } from '../../services/symbolResolver';
import { TypesTreeProvider } from '../../providers/typesTreeProvider';
import { MembersTreeProvider } from '../../providers/membersTreeProvider';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SlotTreeProvider } from '../../providers/slotTreeProvider';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';
import { PaneConfig, createDefaultFilters } from '../../models/paneConfig';

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

  test('PanePipelineManager removes panes and enforces minimum 1 visible pane', () => {
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
    const removed3 = manager.removePane('facet.pane.3');
    assert.ok(removed3);
    assert.strictEqual(manager.getVisiblePanes().length, 2);

    // Remove pane 2
    const removed2 = manager.removePane('facet.pane.2');
    assert.ok(removed2);
    assert.strictEqual(manager.getVisiblePanes().length, 1);

    // Cannot remove the last pane
    const removedLast = manager.removePane('facet.pane.1');
    assert.strictEqual(removedLast, false);
    assert.strictEqual(manager.getVisiblePanes().length, 1);

    coordinator.dispose();
  });

  test('PanePipelineManager Project Browser preset defaults to global project types', async () => {
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
    await manager.applyPreset('project');

    const visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'types');
    assert.strictEqual(visible[0].title, 'Project Types');
    assert.strictEqual(visible[0].inputSource, 'project');

    assert.strictEqual(visible[1].role, 'members');
    assert.strictEqual(visible[1].inputSource, 'previous');

    assert.strictEqual(visible[2].role, 'references');
    assert.strictEqual(visible[2].inputSource, 'previous');

    coordinator.dispose();
  });

  test('SlotTreeProvider delegates to coordinator according to pane role', async () => {
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

    (coordinator as any).cachedWorkspaceTypes = [mockClass];

    const slotConfig: PaneConfig = {
      id: 'facet.pane.1',
      title: 'Project Types',
      role: 'types',
      inputSource: 'project',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    };

    const slotProvider = new SlotTreeProvider(slotConfig, coordinator);

    // Types role returns mockClass
    let children = await slotProvider.getChildren();
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'PipelineTestClass');

    // Switch role to members with input cursor or mockClass
    slotConfig.role = 'members';
    slotConfig.inputSource = 'previous';
    (coordinator as any).getPreviousPane = () => undefined;
    (coordinator as any).getPreviousPaneSelection = () => [mockClass];

    children = await slotProvider.getChildren();
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].name, 'testMethod');

    coordinator.dispose();
  });

  test('PanePipelineManager adds panes before and after slots', async () => {
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

    // Mock promptRolePicker
    (manager as any).promptRolePicker = async () => ({ label: 'Callers', role: 'callers' });

    // Add after pane 1
    const addedAfter = await manager.addPaneAfter('facet.pane.1');
    assert.ok(addedAfter);
    assert.strictEqual(manager.getVisiblePanes().length, 4);
    assert.strictEqual(manager.getVisiblePanes()[1].role, 'callers');
    assert.strictEqual(addedAfter.followSelection, true);
    assert.strictEqual(addedAfter.followCursor, true);
    assert.strictEqual(addedAfter.showIcons, true);
    assert.strictEqual(addedAfter.showContext, true);

    // Add before pane 1
    (manager as any).promptRolePicker = async () => ({ label: 'Hierarchy', role: 'hierarchy' });
    const addedBefore = await manager.addPaneBefore('facet.pane.1');
    assert.ok(addedBefore);
    assert.strictEqual(manager.getVisiblePanes().length, 5);
    assert.strictEqual(manager.getVisiblePanes()[0].role, 'hierarchy');
    assert.strictEqual(addedBefore.followSelection, true);
    assert.strictEqual(addedBefore.followCursor, true);
    assert.strictEqual(addedBefore.showIcons, true);
    assert.strictEqual(addedBefore.showContext, true);

    coordinator.dispose();
  });
});

