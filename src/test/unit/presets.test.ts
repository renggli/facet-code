import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import {
  createDirectoriesPane,
  createFilesPane,
  type PaneConfig,
  PaneInputSource,
  PaneRole,
} from '../../models/paneConfig';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';
import { resetMockState, window } from './mockVscode';

suite('Custom Presets & Preset Management Test Suite', () => {
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

  suite('getSavedPresets', () => {
    test('returns empty object when no presets are stored', () => {
      const presets = manager.getSavedPresets();
      assert.deepStrictEqual(presets, {});
    });

    test('returns workspace presets when scope is workspace', async () => {
      const config = vscode.workspace.getConfiguration('facet');
      const wsData: Record<string, PaneConfig[]> = {
        'My WS Preset': [createDirectoriesPane('facet.pane.1', { title: 'Dirs' })],
      };
      const globalData: Record<string, PaneConfig[]> = {
        'My Global Preset': [createFilesPane('facet.pane.1', { title: 'Files' })],
      };

      await config.update('presets.workspace', wsData, vscode.ConfigurationTarget.Workspace);
      await config.update('presets.global', globalData, vscode.ConfigurationTarget.Global);

      const result = manager.getSavedPresets('workspace');
      assert.strictEqual(Object.keys(result).length, 1);
      assert.ok('My WS Preset' in result);
      assert.strictEqual(result['My WS Preset'][0].role, 'directories');
      assert.strictEqual('My Global Preset' in result, false);
    });

    test('returns global presets when scope is global', async () => {
      const config = vscode.workspace.getConfiguration('facet');
      const wsData: Record<string, PaneConfig[]> = {
        'My WS Preset': [createDirectoriesPane('facet.pane.1', { title: 'Dirs' })],
      };
      const globalData: Record<string, PaneConfig[]> = {
        'My Global Preset': [createFilesPane('facet.pane.1', { title: 'Files' })],
      };

      await config.update('presets.workspace', wsData, vscode.ConfigurationTarget.Workspace);
      await config.update('presets.global', globalData, vscode.ConfigurationTarget.Global);

      const result = manager.getSavedPresets('global');
      assert.strictEqual(Object.keys(result).length, 1);
      assert.ok('My Global Preset' in result);
      assert.strictEqual(result['My Global Preset'][0].role, 'files');
      assert.strictEqual('My WS Preset' in result, false);
    });

    test('merges global and workspace presets when scope is undefined, with workspace taking precedence', async () => {
      const config = vscode.workspace.getConfiguration('facet');
      const wsDefChanges = manager.registry.get(PaneRole.Changes).defaultConfig('facet.pane.1');
      const globalDefProblems = manager.registry.get(PaneRole.Problems).defaultConfig('facet.pane.1');

      const wsData: Record<string, PaneConfig[]> = {
        Common: [createDirectoriesPane('facet.pane.1', { title: 'WS Common' })],
        WorkspaceOnly: [wsDefChanges],
      };
      const globalData: Record<string, PaneConfig[]> = {
        Common: [createFilesPane('facet.pane.1', { title: 'Global Common' })],
        GlobalOnly: [globalDefProblems],
      };

      await config.update('presets.workspace', wsData, vscode.ConfigurationTarget.Workspace);
      await config.update('presets.global', globalData, vscode.ConfigurationTarget.Global);

      const result = manager.getSavedPresets();
      assert.strictEqual(Object.keys(result).length, 3);
      assert.ok('Common' in result);
      assert.ok('WorkspaceOnly' in result);
      assert.ok('GlobalOnly' in result);
      // Workspace overrides global when scope is undefined
      assert.strictEqual(result.Common[0].title, 'WS Common');
    });
  });

  suite('savePreset & deletePreset', () => {
    test('savePreset writes to workspace configuration without affecting global', async () => {
      await manager.savePreset('Custom Review', 'workspace');

      const config = vscode.workspace.getConfiguration('facet');
      const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace');
      const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global');

      assert.ok(wsPresets && 'Custom Review' in wsPresets);
      assert.strictEqual(wsPresets['Custom Review'].length, manager.getVisiblePanes().length);
      assert.strictEqual(globalPresets, undefined);
    });

    test('savePreset writes to global configuration without affecting workspace', async () => {
      await manager.savePreset('Global Default', 'global');

      const config = vscode.workspace.getConfiguration('facet');
      const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace');
      const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global');

      assert.strictEqual(wsPresets, undefined);
      assert.ok(globalPresets && 'Global Default' in globalPresets);
      assert.strictEqual(globalPresets['Global Default'].length, manager.getVisiblePanes().length);
    });

    test('savePreset preserves existing presets in the same scope', async () => {
      await manager.savePreset('Preset 1', 'workspace');
      await manager.savePreset('Preset 2', 'workspace');

      const wsPresets = manager.getSavedPresets('workspace');
      assert.strictEqual(Object.keys(wsPresets).length, 2);
      assert.ok('Preset 1' in wsPresets);
      assert.ok('Preset 2' in wsPresets);
    });

    test('deletePreset removes preset from workspace configuration', async () => {
      await manager.savePreset('To Keep', 'workspace');
      await manager.savePreset('To Delete', 'workspace');

      await manager.deletePreset('To Delete', 'workspace');

      const wsPresets = manager.getSavedPresets('workspace');
      assert.strictEqual(Object.keys(wsPresets).length, 1);
      assert.ok('To Keep' in wsPresets);
      assert.strictEqual('To Delete' in wsPresets, false);
    });

    test('deletePreset removes preset from global configuration', async () => {
      await manager.savePreset('Global Keep', 'global');
      await manager.savePreset('Global Delete', 'global');

      await manager.deletePreset('Global Delete', 'global');

      const globalPresets = manager.getSavedPresets('global');
      assert.strictEqual(Object.keys(globalPresets).length, 1);
      assert.ok('Global Keep' in globalPresets);
      assert.strictEqual('Global Delete' in globalPresets, false);
    });

    test('deletePreset on non-existent preset executes cleanly', async () => {
      await manager.savePreset('Stable', 'workspace');
      await manager.deletePreset('NonExistent', 'workspace');

      const wsPresets = manager.getSavedPresets('workspace');
      assert.strictEqual(Object.keys(wsPresets).length, 1);
      assert.ok('Stable' in wsPresets);
    });
  });

  suite('loadPresetByName', () => {
    test('loads a custom preset saved in workspace', async () => {
      const probDef = manager.registry.get(PaneRole.Problems).defaultConfig('facet.pane.1');
      probDef.title = 'My Problems';
      const changeDef = manager.registry.get(PaneRole.Changes).defaultConfig('facet.pane.2');
      changeDef.title = 'My Changes';
      const customConfig: PaneConfig[] = [probDef, changeDef];

      const config = vscode.workspace.getConfiguration('facet');
      await config.update('presets.workspace', { 'Custom Triage': customConfig });

      await manager.loadPresetByName('Custom Triage');

      const visible = manager.getVisiblePanes();
      assert.strictEqual(visible.length, 2);
      assert.strictEqual(visible[0].role, PaneRole.Problems);
      assert.strictEqual(visible[0].title, 'My Problems');
      assert.strictEqual(visible[1].role, PaneRole.Changes);
      assert.strictEqual(visible[1].title, 'My Changes');
    });

    test('loads a custom preset saved in global settings', async () => {
      const callerDef = manager.registry.get(PaneRole.Callers).defaultConfig('facet.pane.1');
      callerDef.title = 'Global Callers';
      callerDef.inputSource = PaneInputSource.PreviousPane;
      const customConfig: PaneConfig[] = [callerDef];

      const config = vscode.workspace.getConfiguration('facet');
      await config.update('presets.global', { 'Global Callers': customConfig });

      await manager.loadPresetByName('Global Callers');

      const visible = manager.getVisiblePanes();
      assert.strictEqual(visible.length, 1);
      assert.strictEqual(visible[0].role, PaneRole.Callers);
      // When at index 0, previousPane input is re-anchored to project
      assert.strictEqual(visible[0].inputSource, PaneInputSource.Project);
    });

    test('loads built-in preset case-insensitively', async () => {
      await manager.loadPresetByName('ActiveEditor');
      const visible = manager.getVisiblePanes();
      assert.strictEqual(visible.length, 3);
      assert.strictEqual(visible[0].role, 'symbols');
      assert.strictEqual(visible[0].inputSource, 'activeEditor');
    });

    test('ignores unknown preset name without modifying current visible panes', async () => {
      const before = manager.getVisiblePanes().map((p) => p.id);
      await manager.loadPresetByName('completelyUnknownPreset12345');
      const after = manager.getVisiblePanes().map((p) => p.id);
      assert.deepStrictEqual(before, after);
    });

    test('handles malformed preset values gracefully (non-array and empty array)', async () => {
      const config = vscode.workspace.getConfiguration('facet');
      await config.update('presets.workspace', {
        CorruptedNull: null,
        CorruptedString: 'invalid',
        CorruptedObject: { notAnArray: true },
        EmptyArray: [],
      });

      const before = manager.getVisiblePanes().map((p) => p.id);

      await manager.loadPresetByName('CorruptedNull');
      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );

      await manager.loadPresetByName('CorruptedString');
      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );

      await manager.loadPresetByName('CorruptedObject');
      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );

      await manager.loadPresetByName('EmptyArray');
      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );
    });
  });

  suite('promptPreset (applyPreset workflows)', () => {
    test('user selects built-in preset from quickpick', async () => {
      window.pushQuickPick({ preset: 'typeHierarchy' });

      await manager.applyPreset();

      const visible = manager.getVisiblePanes();
      assert.strictEqual(visible.length, 3);
      assert.strictEqual(visible[0].role, 'hierarchy');
      assert.strictEqual(visible[1].role, 'symbols');
      assert.strictEqual(visible[2].role, 'implementations');
    });

    test('user cancels quickpick does not alter visible panes', async () => {
      window.pushQuickPick(undefined);
      const before = manager.getVisiblePanes().map((p) => p.id);

      await manager.applyPreset();

      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );
    });

    test('save workflow: user enters name and selects workspace', async () => {
      // 1st quickpick: user chooses save
      window.pushQuickPick({ action: 'save' });
      // Input box: preset name
      window.pushInputBox('Workflow Alpha');
      // 2nd quickpick: select workspace target
      window.pushQuickPick({ label: 'Workspace', target: 'workspace' });

      let notification = '';
      window.showInformationMessage = async (msg?: string) => {
        notification = msg ?? '';
      };

      await manager.applyPreset();

      const wsPresets = manager.getSavedPresets('workspace');
      assert.ok('Workflow Alpha' in wsPresets);
      assert.ok(notification.includes('Workflow Alpha'));
      assert.ok(notification.includes('Workspace'));
    });

    test('save workflow: user enters name and selects global', async () => {
      window.pushQuickPick({ action: 'save' });
      window.pushInputBox('Global Workflow');
      window.pushQuickPick({ label: 'Global', target: 'global' });

      let notification = '';
      window.showInformationMessage = async (msg?: string) => {
        notification = msg ?? '';
      };

      await manager.applyPreset();

      const globalPresets = manager.getSavedPresets('global');
      assert.ok('Global Workflow' in globalPresets);
      assert.ok(notification.includes('Global Workflow'));
    });

    test('save workflow: cancels when preset name is empty or cancelled', async () => {
      window.pushQuickPick({ action: 'save' });
      window.pushInputBox(undefined);

      await manager.applyPreset();
      assert.deepStrictEqual(manager.getSavedPresets(), {});

      window.pushQuickPick({ action: 'save' });
      window.pushInputBox('   ');

      await manager.applyPreset();
      assert.deepStrictEqual(manager.getSavedPresets(), {});
    });

    test('save workflow: cancels when target scope quickpick is dismissed', async () => {
      window.pushQuickPick({ action: 'save' });
      window.pushInputBox('Cancelled Scope');
      window.pushQuickPick(undefined);

      await manager.applyPreset();
      assert.deepStrictEqual(manager.getSavedPresets(), {});
    });

    test('load workflow: shows message when no saved presets exist', async () => {
      window.pushQuickPick({ action: 'load' });

      let infoMsg = '';
      window.showInformationMessage = async (msg?: string) => {
        infoMsg = msg ?? '';
      };

      await manager.applyPreset();
      assert.ok(infoMsg.includes('No saved presets found'));
    });

    test('load workflow: selects and loads saved preset', async () => {
      const changeDef = manager.registry.get(PaneRole.Changes).defaultConfig('facet.pane.1');
      changeDef.title = 'Changes Only';
      const customConfig: PaneConfig[] = [changeDef];
      const config = vscode.workspace.getConfiguration('facet');
      await config.update('presets.workspace', { 'Changes Flow': customConfig });

      // 1st quickpick: choose load
      window.pushQuickPick({ action: 'load' });
      // 2nd quickpick: select custom preset
      window.pushQuickPick({ preset: customConfig });

      await manager.applyPreset();

      const visible = manager.getVisiblePanes();
      assert.strictEqual(visible.length, 1);
      assert.strictEqual(visible[0].role, PaneRole.Changes);
      assert.strictEqual(visible[0].title, 'Changes Only');
    });

    test('load workflow: user cancels selection quickpick', async () => {
      const changeDef = manager.registry.get(PaneRole.Changes).defaultConfig('facet.pane.1');
      changeDef.title = 'Changes Only';
      const customConfig: PaneConfig[] = [changeDef];
      const config = vscode.workspace.getConfiguration('facet');
      await config.update('presets.workspace', { 'Changes Flow': customConfig });

      window.pushQuickPick({ action: 'load' });
      window.pushQuickPick(undefined);

      const before = manager.getVisiblePanes().map((p) => p.id);
      await manager.applyPreset();
      assert.deepStrictEqual(
        manager.getVisiblePanes().map((p) => p.id),
        before,
      );
    });

    test('delete workflow: shows message when no saved presets exist', async () => {
      window.pushQuickPick({ action: 'delete' });

      let infoMsg = '';
      window.showInformationMessage = async (msg?: string) => {
        infoMsg = msg ?? '';
      };

      await manager.applyPreset();
      assert.ok(infoMsg.includes('No saved presets found'));
    });

    test('delete workflow: selects and deletes preset', async () => {
      await manager.savePreset('To Erase', 'workspace');
      assert.ok('To Erase' in manager.getSavedPresets('workspace'));

      // 1st quickpick: choose delete
      window.pushQuickPick({ action: 'delete' });
      // 2nd quickpick: pick the preset to erase
      window.pushQuickPick({ name: 'To Erase', target: 'workspace' });

      let notification = '';
      window.showInformationMessage = async (msg?: string) => {
        notification = msg ?? '';
      };

      await manager.applyPreset();

      assert.strictEqual('To Erase' in manager.getSavedPresets('workspace'), false);
      assert.ok(notification.includes('Deleted preset "To Erase"'));
    });

    test('delete workflow: user cancels delete quickpick', async () => {
      await manager.savePreset('To Keep', 'workspace');

      window.pushQuickPick({ action: 'delete' });
      window.pushQuickPick(undefined);

      await manager.applyPreset();
      assert.ok('To Keep' in manager.getSavedPresets('workspace'));
    });
  });
});
