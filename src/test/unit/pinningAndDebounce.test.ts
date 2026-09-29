import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import {
  createDefaultFilters,
  type FilesPaneConfig,
  type HierarchyPaneConfig,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';
import type { FacetSymbolNode } from '../../models/symbolNode';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { resetMockState } from './mockVscode';

suite('Pinning & Cursor Debouncing Test Suite', () => {
  let resolver: SymbolResolver;
  let relationsProvider: RelationsTreeProvider;
  let coordinator: FacetCoordinator;
  let manager: PanePipelineManager;

  setup(() => {
    resetMockState();
    resolver = new SymbolResolver();
    relationsProvider = new RelationsTreeProvider();
    coordinator = new FacetCoordinator(resolver, relationsProvider);
    manager = new PanePipelineManager(coordinator);
  });

  teardown(() => {
    coordinator.dispose();
    resetMockState();
  });

  suite('Cascading Pinning Mechanism', () => {
    test('setPinned with cascade=true locks all upstream previousPane slots', async () => {
      // Pipeline: Slot 1 (activeEditor) -> Slot 2 (previousPane) -> Slot 3 (previousPane) -> Slot 4 (project)
      const p1: SymbolsPaneConfig = {
        id: 'facet.pane.1',
        role: 'symbols',
        title: 'Editor Symbols',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
      };
      const p2: SymbolsPaneConfig = {
        id: 'facet.pane.2',
        role: 'symbols',
        title: 'Members',
        visible: true,
        inputSource: 'previousPane',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
      };
      const p3: SymbolsPaneConfig = {
        id: 'facet.pane.3',
        role: 'symbols',
        title: 'Sub-Members',
        visible: true,
        inputSource: 'previousPane',
        selectionSource: 'none',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
      };
      const p4: FilesPaneConfig = {
        id: 'facet.pane.4',
        role: 'files',
        title: 'Project Files',
        visible: true,
        inputSource: 'project',
        selectionSource: 'cursor',
        sort: 'name',
        tree: false,
      };

      await manager.applyVisiblePanes([p1, p2, p3, p4]);

      // Pin slot 3 with cascade (travels upwards to slot 2 and slot 1)
      await manager.setPinned('facet.pane.3', true, true);

      const panes = manager.getVisiblePanes();
      assert.strictEqual(Boolean(panes[0].pinned), true);
      assert.strictEqual(Boolean(panes[1].pinned), true);
      assert.strictEqual(Boolean(panes[2].pinned), true);
      // Slot 4 is downstream of slot 3, so it should not be pinned
      assert.strictEqual(Boolean(panes[3].pinned), false);

      // Unpin slot 3 with cascade (travels upwards to slot 2 and slot 1)
      await manager.setPinned('facet.pane.3', false, true);

      const unpinned = manager.getVisiblePanes();
      assert.strictEqual(Boolean(unpinned[0].pinned), false);
      assert.strictEqual(Boolean(unpinned[1].pinned), false);
      assert.strictEqual(Boolean(unpinned[2].pinned), false);
      assert.strictEqual(Boolean(unpinned[3].pinned), false);
    });

    test('setPinned with cascade=false pins only the targeted slot', async () => {
      const p1: SymbolsPaneConfig = {
        id: 'facet.pane.1',
        role: 'symbols',
        title: 'Symbols',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
      };
      const p2: SymbolsPaneConfig = {
        id: 'facet.pane.2',
        role: 'symbols',
        title: 'Members',
        visible: true,
        inputSource: 'previousPane',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
      };

      await manager.applyVisiblePanes([p1, p2]);

      // Pin only slot 2 without cascade
      await manager.setPinned('facet.pane.2', true, false);

      const panes = manager.getVisiblePanes();
      assert.strictEqual(Boolean(panes[0].pinned), false);
      assert.strictEqual(Boolean(panes[1].pinned), true);
    });

    test('togglePin inverts pin state and cascades to dependents', async () => {
      const p1: SymbolsPaneConfig = {
        id: 'facet.pane.1',
        role: 'symbols',
        title: 'Symbols',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
      };
      const p2: SymbolsPaneConfig = {
        id: 'facet.pane.2',
        role: 'symbols',
        title: 'Members',
        visible: true,
        inputSource: 'previousPane',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: false,
      };

      await manager.applyVisiblePanes([p1, p2]);

      // Initially unpinned
      assert.strictEqual(Boolean(manager.getPane('facet.pane.1')?.pinned), false);
      assert.strictEqual(Boolean(manager.getPane('facet.pane.2')?.pinned), false);

      // Toggle slot 2 to true: cascades upwards to slot 1
      await manager.togglePin('facet.pane.2');
      assert.strictEqual(Boolean(manager.getPane('facet.pane.1')?.pinned), true);
      assert.strictEqual(Boolean(manager.getPane('facet.pane.2')?.pinned), true);

      // Toggle slot 2 back to false: cascades upwards to slot 1
      await manager.togglePin('facet.pane.2');
      assert.strictEqual(Boolean(manager.getPane('facet.pane.1')?.pinned), false);
      assert.strictEqual(Boolean(manager.getPane('facet.pane.2')?.pinned), false);
    });
  });

  suite('pinnedUri Lifecycle & Active Editor Isolation', () => {
    test('records pinnedUri when activeEditor pane is pinned', async () => {
      const uriA = vscode.Uri.file('/workspace/src/fileA.ts');
      const docA = {
        uri: uriA,
        version: 1,
        getText: () => 'export class ClassA {}',
      };
      coordinator.handleEditorChange({
        document: docA,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      const p1: SymbolsPaneConfig = {
        id: 'facet.pane.1',
        role: 'symbols',
        title: 'Symbols',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
      };
      await manager.applyVisiblePanes([p1]);

      await manager.setPinned('facet.pane.1', true);
      assert.strictEqual(manager.getPane('facet.pane.1')?.pinnedUri, uriA.toString());

      // Switch active editor to File B
      const uriB = vscode.Uri.file('/workspace/src/fileB.ts');
      const docB = {
        uri: uriB,
        version: 1,
        getText: () => 'export class ClassB {}',
      };
      coordinator.handleEditorChange({
        document: docB,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      // Pinned URI remains unchanged
      assert.strictEqual(manager.getPane('facet.pane.1')?.pinnedUri, uriA.toString());

      // Unpinning clears pinnedUri
      await manager.setPinned('facet.pane.1', false);
      assert.strictEqual(manager.getPane('facet.pane.1')?.pinnedUri, undefined);
    });

    test('hierarchy pane respects pinnedUri and does not switch on active editor changes', async () => {
      const uriA = vscode.Uri.file('/workspace/src/auth.ts');
      const uriB = vscode.Uri.file('/workspace/src/order.ts');

      const docA = {
        uri: uriA,
        version: 1,
        getText: () => 'export class AuthService {}',
      };
      const docB = {
        uri: uriB,
        version: 1,
        getText: () => 'export class OrderService {}',
      };

      const origOpenTextDocument = vscode.workspace.openTextDocument;
      vscode.workspace.openTextDocument = async (uri: unknown) => {
        const u = uri as vscode.Uri;
        if (u.fsPath.includes('auth')) {
          return docA as unknown as vscode.TextDocument;
        }
        return docB as unknown as vscode.TextDocument;
      };

      coordinator.handleEditorChange({
        document: docA,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      const hierPane: HierarchyPaneConfig = {
        id: 'facet.pane.1',
        role: 'hierarchy',
        title: 'Hierarchy',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
        subclassTypes: ['class'],
      };

      await manager.applyVisiblePanes([hierPane]);
      await manager.setPinned('facet.pane.1', true);

      // Switch editor to docB
      coordinator.handleEditorChange({
        document: docB,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);

      const items = await coordinator.getSlotChildren<FacetSymbolNode>(manager.getPane('facet.pane.1')!);
      assert.ok(items.length > 0);
      assert.strictEqual(items[0].name, 'AuthService');

      vscode.workspace.openTextDocument = origOpenTextDocument;
    });
  });

  suite('scheduleSelectionChange Debouncing (150ms)', () => {
    test('rapid cursor events coalesce into a single execution of handleSelectionChange', async () => {
      const uri = vscode.Uri.file('/workspace/src/controller.ts');
      const doc = {
        uri,
        version: 1,
        getText: () => `export class Controller {
  actionOne() {}
  actionTwo() {}
  actionThree() {}
}`,
      };

      const p1: SymbolsPaneConfig = {
        id: 'facet.pane.1',
        role: 'symbols',
        title: 'Symbols',
        visible: true,
        inputSource: 'activeEditor',
        selectionSource: 'cursor',
        sort: 'name',
        filters: createDefaultFilters(),
        tree: true,
      };
      await manager.applyVisiblePanes([p1]);

      let handleCallCount = 0;
      let lastRevealedSlot: string | undefined;

      const origHandleSelection = coordinator.handleSelectionChange.bind(coordinator);
      coordinator.handleSelectionChange = async (editor, options) => {
        handleCallCount++;
        lastRevealedSlot = await origHandleSelection(editor, options);
        return lastRevealedSlot;
      };

      coordinator.handleEditorChange({
        document: doc,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor);
      // Wait for handleEditorChange scheduleSync debounce timer (150ms) to complete
      await new Promise((r) => setTimeout(r, 200));
      handleCallCount = 0;

      // Simulate 5 rapid cursor movements within 40ms
      const editor1 = {
        document: doc,
        selection: new vscode.Selection(1, 2, 1, 10),
        revealRange: () => {},
      } as unknown as vscode.TextEditor;

      const editor2 = {
        document: doc,
        selection: new vscode.Selection(2, 2, 2, 10),
        revealRange: () => {},
      } as unknown as vscode.TextEditor;

      const editorFinal = {
        document: doc,
        selection: new vscode.Selection(3, 2, 3, 10),
        revealRange: () => {},
      } as unknown as vscode.TextEditor;

      coordinator.scheduleSelectionChange(editor1);
      await new Promise((r) => setTimeout(r, 10));
      coordinator.scheduleSelectionChange(editor2);
      await new Promise((r) => setTimeout(r, 10));
      coordinator.scheduleSelectionChange(editorFinal);

      // Immediately after scheduling, handleCallCount must still be 0 (debouncing)
      assert.strictEqual(handleCallCount, 0);

      // Wait 220ms (more than 150ms debounce window)
      await new Promise((r) => setTimeout(r, 220));

      // Must have executed exactly once for the final cursor position
      assert.strictEqual(handleCallCount, 1);
    });

    test('disposing coordinator clears selection debounce timer and cancels pending execution', async () => {
      const uri = vscode.Uri.file('/workspace/src/disposed.ts');
      const doc = {
        uri,
        version: 1,
        getText: () => 'export class DisposedCheck {}',
      };

      let callbackFired = false;
      coordinator.handleSelectionChange = async () => {
        callbackFired = true;
        return undefined;
      };

      const editor = {
        document: doc,
        selection: new vscode.Selection(0, 0, 0, 0),
        revealRange: () => {},
      } as unknown as vscode.TextEditor;

      coordinator.scheduleSelectionChange(editor);

      // Dispose immediately before 150ms expires
      coordinator.dispose();

      // Wait 200ms
      await new Promise((r) => setTimeout(r, 200));

      // Callback must never fire after disposal
      assert.strictEqual(callbackFired, false);
    });
  });
});
