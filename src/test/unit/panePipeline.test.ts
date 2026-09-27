import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import { parseSlotOrderFromBuffer, WorkbenchLayoutWatcher } from '../../coordinator/workbenchLayoutWatcher';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SlotTreeProvider } from '../../providers/slotTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { window } from './mockVscode';

suite('PanePipelineManager & SlotTreeProvider Test Suite', () => {
  setup(() => {
    window.clearPromptQueues();
  });

  teardown(() => {
    window.clearPromptQueues();
  });

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
    assert.strictEqual(manager.getVisiblePanes()[2].role, 'symbols');
    assert.strictEqual(manager.getVisiblePanes()[2].title, 'Definitions');
    assert.strictEqual((manager.getVisiblePanes()[2] as any).tree, false);
    assert.strictEqual(manager.getVisiblePanes()[3].role, 'symbols');
    assert.strictEqual(manager.getVisiblePanes()[3].title, 'Members');
    assert.strictEqual((manager.getVisiblePanes()[3] as any).tree, true);

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
    const addedOverflow = await manager.addPaneToEnd('symbols');
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
    assert.strictEqual(visibleAfter[1].role, 'symbols');
    assert.strictEqual(visibleAfter[2].id, 'facet.pane.3');
    assert.strictEqual(visibleAfter[2].role, 'symbols');

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

  test('PanePipelineManager configurePane executes title, role, input, selection, filter, sort, and tree actions', async () => {
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

    // 8. Test Tree display mode toggle
    window.pushQuickPick({ action: 'tree' });
    window.pushQuickPick({ tree: false });
    await manager.configurePane('facet.pane.3');
    assert.strictEqual((manager.getPane('facet.pane.3') as any)?.tree, false);

    // 9. Test Add Pane action via promptAddPane()
    window.pushQuickPick({ role: 'callers', label: 'Callers' });
    await manager.promptAddPane();
    assert.strictEqual(manager.getVisiblePanes().length, 5);
    assert.strictEqual(manager.getVisiblePanes()[4].role, 'callers');

    // 10. Test Remove Pane action via promptRemovePane()
    window.pushQuickPick({ id: 'facet.pane.5' });
    await manager.promptRemovePane();
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    coordinator.dispose();
  });

  test('PanePipelineManager applyPreset configures all presets correctly', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // Apply Active Editor preset
    await manager.applyPreset('Active Editor');
    let visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'symbols');
    assert.strictEqual(visible[0].inputSource, 'activeEditor');
    assert.strictEqual(visible[1].role, 'symbols');
    assert.strictEqual(visible[2].role, 'callers');

    // Apply Working Changes preset
    await manager.applyPreset('Working Changes');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 4);
    assert.strictEqual(visible[0].role, 'changes');
    assert.strictEqual(visible[1].role, 'symbols');
    assert.strictEqual(visible[2].role, 'symbols');
    assert.strictEqual(visible[3].role, 'problems');

    // Apply Problem Triage preset
    await manager.applyPreset('Problem Triage');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 4);
    assert.strictEqual(visible[0].role, 'problems');
    assert.strictEqual(visible[1].role, 'symbols');
    assert.strictEqual(visible[2].role, 'symbols');
    assert.strictEqual(visible[3].role, 'references');

    // Apply Type Hierarchy preset
    await manager.applyPreset('Type Hierarchy');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 3);
    assert.strictEqual(visible[0].role, 'hierarchy');
    assert.strictEqual(visible[1].role, 'symbols');
    assert.strictEqual(visible[2].role, 'implementations');

    // Apply Open Editors preset
    await manager.applyPreset('Open Editors');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 4);
    assert.strictEqual(visible[0].role, 'files');
    assert.strictEqual(visible[0].inputSource, 'openEditors');
    assert.strictEqual(visible[1].role, 'symbols');
    assert.strictEqual(visible[2].role, 'symbols');
    assert.strictEqual(visible[3].role, 'references');

    // Apply Project Browser preset
    await manager.applyPreset('Project Browser');
    visible = manager.getVisiblePanes();
    assert.strictEqual(visible.length, 4);
    assert.strictEqual(visible[0].role, 'directories');
    assert.strictEqual(visible[1].role, 'files');
    assert.strictEqual(visible[2].role, 'symbols');
    assert.strictEqual(visible[3].role, 'symbols');

    // Save current preset to workspace and global
    await manager.savePreset('MyCustomPreset', 'workspace');
    await manager.savePreset('GlobalCustomPreset', 'global');

    const wsPresets = manager.getSavedPresets('workspace');
    assert.ok(wsPresets.MyCustomPreset);
    assert.strictEqual(wsPresets.MyCustomPreset.length, 4);

    const allPresets = manager.getSavedPresets();
    assert.ok(allPresets.MyCustomPreset);
    assert.ok(allPresets.GlobalCustomPreset);

    // Apply custom saved preset
    await manager.applyPreset('Active Editor');
    assert.strictEqual(manager.getVisiblePanes().length, 3);
    await manager.applyPreset('MyCustomPreset');
    assert.strictEqual(manager.getVisiblePanes().length, 4);

    // Delete custom preset
    await manager.deletePreset('MyCustomPreset', 'workspace');
    const afterDelete = manager.getSavedPresets('workspace');
    assert.strictEqual(afterDelete.MyCustomPreset, undefined);

    // Interactive applyPreset save & load flow
    window.pushQuickPick({ action: 'save' });
    window.pushInputBox('InteractivePreset');
    window.pushQuickPick({ target: 'workspace', label: 'Workspace' });
    await manager.applyPreset();
    assert.ok(manager.getSavedPresets('workspace').InteractivePreset);

    window.pushQuickPick({ action: 'load' });
    window.pushQuickPick({ preset: wsPresets.MyCustomPreset, label: 'InteractivePreset' });
    await manager.applyPreset();

    window.pushQuickPick({ action: 'delete' });
    window.pushQuickPick({ name: 'InteractivePreset', target: 'workspace' });
    await manager.applyPreset();
    assert.strictEqual(manager.getSavedPresets('workspace').InteractivePreset, undefined);

    // Test: Hiding one pane then loading default preset restores all 4 panes
    await manager.removePane(manager.getVisiblePanes()[0].id);
    assert.strictEqual(manager.getVisiblePanes().length, 3);
    await manager.applyPreset('Project Browser');
    const restored = manager.getVisiblePanes();
    assert.strictEqual(restored.length, 4);
    assert.strictEqual(restored[0].role, 'directories');
    assert.strictEqual(restored[1].role, 'files');
    assert.strictEqual(restored[2].role, 'symbols');
    assert.strictEqual(restored[3].role, 'symbols');

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
    const dummyItem = vscode.Uri.file('/tmp/test');
    assert.strictEqual(unknownProvider.getParent(dummyItem), undefined);
    assert.strictEqual(unknownProvider.getTreeItem(dummyItem).label, '');

    // Provider with explicit config
    const explicitConfig = manager.getPanes()[0];
    const explicitProvider = new SlotTreeProvider(explicitConfig, coordinator);
    assert.strictEqual(explicitProvider.config?.id, explicitConfig.id);

    coordinator.dispose();
  });

  test('reorderSlots adapts piping to visual order and re-anchors index 0', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // Initial slots: [facet.pane.1 (directories), facet.pane.2 (files), facet.pane.3 (types), facet.pane.4 (members)]
    // Drag-and-drop workbench reordering sends new slot IDs sequence:
    const changed = await manager.reorderSlots(['facet.pane.3', 'facet.pane.1', 'facet.pane.2', 'facet.pane.4']);
    assert.ok(changed);

    const visible = manager.getVisiblePanes();
    assert.strictEqual(visible[0].id, 'facet.pane.3');
    assert.strictEqual(visible[0].role, 'symbols');
    // Because Types was at index 0 and had inputSource: 'previousPane', it must safely default to 'project'
    assert.strictEqual(visible[0].inputSource, 'project');

    assert.strictEqual(visible[1].id, 'facet.pane.1');
    assert.strictEqual(visible[1].role, 'directories');

    // Upstream piping relative to visual order:
    // facet.pane.1's upstream is facet.pane.3
    const upstream1 = coordinator.getPreviousPane('facet.pane.1');
    assert.strictEqual(upstream1?.id, 'facet.pane.3');

    // facet.pane.2's upstream is facet.pane.1
    const upstream2 = coordinator.getPreviousPane('facet.pane.2');
    assert.strictEqual(upstream2?.id, 'facet.pane.1');

    // Repeating identical order returns false
    const unchanged = await manager.reorderSlots(['facet.pane.3', 'facet.pane.1', 'facet.pane.2', 'facet.pane.4']);
    assert.strictEqual(unchanged, false);

    // Now apply "Project Browser" preset: the visual sequence MUST remain:
    // visual slot 0 (facet.pane.3): Directories
    // visual slot 1 (facet.pane.1): Files
    // visual slot 2 (facet.pane.2): Types
    // visual slot 3 (facet.pane.4): Members
    await manager.applyPreset('Project Browser');
    const visibleAfterPreset = manager.getVisiblePanes();
    assert.strictEqual(visibleAfterPreset.length, 4);
    assert.strictEqual(visibleAfterPreset[0].id, 'facet.pane.3');
    assert.strictEqual(visibleAfterPreset[0].role, 'directories');
    assert.strictEqual(visibleAfterPreset[1].id, 'facet.pane.1');
    assert.strictEqual(visibleAfterPreset[1].role, 'files');
    assert.strictEqual(visibleAfterPreset[2].id, 'facet.pane.2');
    assert.strictEqual(visibleAfterPreset[2].role, 'symbols');
    assert.strictEqual(visibleAfterPreset[3].id, 'facet.pane.4');
    assert.strictEqual(visibleAfterPreset[3].role, 'symbols');

    coordinator.dispose();
  });

  test('parseSlotOrderFromBuffer extracts slot order across multiple workbench storage formats', () => {
    // Pattern 1: "facet.pane.X":{"order":N}
    const buf1 = '{"facet.pane.2":{"order":0},"facet.pane.1":{"order":1},"facet.pane.3":{"order":2}}';
    assert.deepStrictEqual(parseSlotOrderFromBuffer(buf1), ['facet.pane.2', 'facet.pane.1', 'facet.pane.3']);

    // Pattern 2: {"order":N,"id":"facet.pane.X"}
    const buf2 = '{"order":1,"id":"facet.pane.2"},{"order":0,"id":"facet.pane.1"}';
    assert.deepStrictEqual(parseSlotOrderFromBuffer(buf2), ['facet.pane.1', 'facet.pane.2']);

    // Pattern 3: "facet.pane.X" ... "order": N
    const buf3 = '"facet.pane.4" some details "order": 0 ... "facet.pane.1" some details "order": 1';
    assert.deepStrictEqual(parseSlotOrderFromBuffer(buf3), ['facet.pane.4', 'facet.pane.1']);

    // Pattern 4: array of views without explicit order
    const buf4 = '{"facet-container":[{"id":"facet.pane.3"},{"id":"facet.pane.2"},{"id":"facet.pane.1"}]}';
    assert.deepStrictEqual(parseSlotOrderFromBuffer(buf4), ['facet.pane.3', 'facet.pane.2', 'facet.pane.1']);

    // Insufficient matches (< 2 slots)
    assert.strictEqual(parseSlotOrderFromBuffer('{"facet.pane.1":{"order":0}}'), undefined);
    assert.strictEqual(parseSlotOrderFromBuffer('non-matching text'), undefined);
    assert.strictEqual(parseSlotOrderFromBuffer(Buffer.from('non-matching buffer')), undefined);
  });

  test('WorkbenchLayoutWatcher detects storage file changes and notifies listener', () => {
    // 1. Without storageUri: gracefully handles initialization and dispose
    const watcherNoStorage = new WorkbenchLayoutWatcher(undefined, undefined, () => {});
    watcherNoStorage.checkOrder();
    watcherNoStorage.dispose();

    // 2. With real temporary storage directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-workbench-test-'));
    const stateFile = path.join(tempDir, 'state.vscdb');
    const walFile = path.join(tempDir, 'state.vscdb-wal');

    // Initial state file
    fs.writeFileSync(stateFile, '{"facet.pane.2":{"order":0},"facet.pane.1":{"order":1}}', 'utf8');

    let reportedOrder: string[] = [];
    let watcher: WorkbenchLayoutWatcher | undefined;
    try {
      watcher = new WorkbenchLayoutWatcher(vscode.Uri.file(stateFile), undefined, (order) => {
        reportedOrder = order;
      });

      // Initial check should have populated reportedOrder
      assert.deepStrictEqual(reportedOrder, ['facet.pane.2', 'facet.pane.1']);

      // Checking order again without file modification should not re-trigger callback
      reportedOrder = [];
      watcher.checkOrder();
      assert.deepStrictEqual(reportedOrder, []);

      // Write updated slot order into WAL file
      fs.writeFileSync(walFile, '{"facet.pane.1":{"order":0},"facet.pane.2":{"order":1}}', 'utf8');
      watcher.checkOrder();
      assert.deepStrictEqual(reportedOrder, ['facet.pane.1', 'facet.pane.2']);
    } finally {
      watcher?.dispose();

      // Clean up temporary files
      try {
        if (fs.existsSync(walFile)) {
          fs.unlinkSync(walFile);
        }
        if (fs.existsSync(stateFile)) {
          fs.unlinkSync(stateFile);
        }
        fs.rmdirSync(tempDir);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('PanePipelineManager modular configuration methods operate correctly', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    // 1. configurePaneType
    window.pushQuickPick({ role: 'symbols', label: 'Symbols' });
    await manager.configurePaneType('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.role, 'symbols');

    // 2. configureInputSource
    window.pushQuickPick({ source: 'activeEditor', label: 'Active Editor' });
    await manager.configureInputSource('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.inputSource, 'activeEditor');

    // 3. configureSelectionSource
    window.pushQuickPick({ source: 'all' });
    await manager.configureSelectionSource('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.selectionSource, 'all');

    // 4. configureSort
    window.pushQuickPick({ sort: 'name' });
    await manager.configureSort('facet.pane.1');
    assert.strictEqual(manager.getPane('facet.pane.1')?.sort, 'name');

    // 5. configureFilter (files pane)
    window.pushInputBox('**/*.test.ts');
    await manager.configureFilter('facet.pane.2');
    assert.strictEqual((manager.getPane('facet.pane.2') as any)?.globPattern, '**/*.test.ts');

    // 6. configureTreeDisplay (files pane)
    window.pushQuickPick({ tree: true });
    await manager.configureTreeDisplay('facet.pane.2');
    assert.strictEqual((manager.getPane('facet.pane.2') as any)?.tree, true);

    // 7. configureTreeDisplay (symbols pane)
    window.pushQuickPick({ tree: false });
    await manager.configureTreeDisplay('facet.pane.3');
    assert.strictEqual((manager.getPane('facet.pane.3') as any)?.tree, false);

    window.pushQuickPick({ tree: true });
    await manager.configureTreeDisplay('facet.pane.3');
    assert.strictEqual((manager.getPane('facet.pane.3') as any)?.tree, true);

    coordinator.dispose();
  });

  test('all 6 presets resolve slot tree items through coordinator without throwing', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    const presetNames = [
      'Project Browser',
      'Active Editor',
      'Working Changes',
      'Problem Triage',
      'Type Hierarchy',
      'Open Editors',
    ];

    for (const name of presetNames) {
      await manager.applyPreset(name);
      const visible = manager.getVisiblePanes();
      assert.ok(visible.length >= 3, `Preset ${name} should have at least 3 visible panes`);
      for (const pane of visible) {
        const children = await coordinator.getSlotChildren(pane);
        assert.ok(Array.isArray(children), `Children for ${pane.id} in preset ${name} must be an array`);
      }
    }

    coordinator.dispose();
  });
});
