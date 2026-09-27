import * as vscode from 'vscode';
import {
  createDefaultPanes,
  type PaneConfig,
  type PaneInputSource,
  type PaneRole,
  type SelectionSource,
  type SortOption,
} from '../models/paneConfig';
import type { PaneExecutionContext, PaneOutput } from '../panes/paneDefinition';
import type { PaneRegistry } from '../panes/paneRegistry';
import type { FacetCoordinator } from './facetCoordinator';

export class PanePipelineManager {
  private panes: PaneConfig[];
  public readonly registry: PaneRegistry;

  private _onDidUpdatePanes = new vscode.EventEmitter<void>();
  readonly onDidUpdatePanes = this._onDidUpdatePanes.event;

  constructor(
    private readonly coordinator: FacetCoordinator,
    initialPanes?: PaneConfig[],
    registry?: PaneRegistry,
  ) {
    this.registry = registry || coordinator.registry;
    this.panes = initialPanes || createDefaultPanes();
    this.coordinator.setPipelineManager(this);
    void this.syncContextKeys();
  }

  public getPanes(): PaneConfig[] {
    return this.panes;
  }

  public getVisiblePanes(): PaneConfig[] {
    return this.panes.filter((p) => p.visible);
  }

  public getPane(slotId: string): PaneConfig | undefined {
    return this.panes.find((p) => p.id === slotId);
  }

  public async syncContextKeys(): Promise<void> {
    const allRoles: PaneRole[] = [
      'files',
      'directories',
      'symbols',
      'definitions',
      'declarations',
      'implementations',
      'references',
      'problems',
      'changes',
      'callers',
      'hierarchy',
    ];
    const visibleRoles = new Set(this.getVisiblePanes().map((p) => p.role));

    const contextPromises: Thenable<any>[] = [];
    for (const pane of this.panes) {
      contextPromises.push(vscode.commands.executeCommand('setContext', `${pane.id}.visible`, pane.visible));
      const def = this.registry.tryGet(pane.role);
      const hasTree = Boolean(def?.capabilities.hasTreeToggle);
      const isTree = hasTree ? Boolean((pane as any).tree) : false;
      const hasFilter = Boolean(def?.capabilities.hasFilter);

      contextPromises.push(
        vscode.commands.executeCommand('setContext', `${pane.id}.hasTree`, hasTree),
        vscode.commands.executeCommand('setContext', `${pane.id}.isTree`, isTree),
        vscode.commands.executeCommand('setContext', `${pane.id}.hasFilter`, hasFilter),
      );
    }

    for (const role of allRoles) {
      contextPromises.push(
        vscode.commands.executeCommand('setContext', `facet.role.${role}.visible`, visibleRoles.has(role)),
      );
    }

    await Promise.all(contextPromises);
  }

  public async getUpstreamOutput(slotId: string): Promise<PaneOutput> {
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx <= 0) {
      return {};
    }
    const prev = visible[idx - 1];
    const def = this.registry.tryGet(prev.role);
    if (!def) {
      return {};
    }
    let items = this.coordinator.getSlotSelection(prev.id);
    if (items.length === 0) {
      items = await this.coordinator.getSlotChildren(prev);
    }
    const context: PaneExecutionContext = {
      config: prev,
      slotId: prev.id,
      coordinator: this.coordinator,
      upstreamOutput: {},
    };
    return def.getOutput(items, context);
  }

  public async applyVisiblePanes(newVisible: PaneConfig[], reveal = true): Promise<void> {
    const totalSlots = 6;
    const clampedVisible = newVisible.slice(0, totalSlots);

    const currentSlotIds = this.panes ? this.panes.map((p) => p.id) : [];
    const allSlotIds = ['facet.pane.1', 'facet.pane.2', 'facet.pane.3', 'facet.pane.4', 'facet.pane.5', 'facet.pane.6'];
    const visualSlotOrder = [...currentSlotIds.filter((id) => allSlotIds.includes(id))];
    for (const id of allSlotIds) {
      if (!visualSlotOrder.includes(id)) {
        visualSlotOrder.push(id);
      }
    }

    const updatedPanes: PaneConfig[] = [];
    for (let i = 0; i < clampedVisible.length; i++) {
      const p = clampedVisible[i];
      p.id = visualSlotOrder[i];
      p.visible = true;

      if (i === 0 && p.inputSource === 'previousPane') {
        p.inputSource = 'project' as any;
      }
      updatedPanes.push(p);
    }

    const defaultDef = this.registry.get('symbols');
    for (let i = clampedVisible.length; i < totalSlots; i++) {
      const slotId = visualSlotOrder[i];
      const hiddenPane = defaultDef.defaultConfig(slotId);
      hiddenPane.visible = false;
      updatedPanes.push(hiddenPane);
    }

    this.panes = updatedPanes;
    await this.syncContextKeys();
    this.coordinator.clearSlotSelections();
    this._onDidUpdatePanes.fire();

    if (reveal && this.coordinator) {
      await this.coordinator.sync();
    }
  }

  public async removePane(slotId: string): Promise<boolean> {
    const visible = this.getVisiblePanes();
    if (visible.length <= 1) {
      void vscode.window.showWarningMessage?.('At least one pane must remain in the pipeline.');
      return false;
    }
    const newVisible = visible.filter((p) => p.id !== slotId);
    await this.applyVisiblePanes(newVisible);
    return true;
  }

  public async deletePane(slotId: string): Promise<boolean> {
    return this.removePane(slotId);
  }

  public async promptAddPane(): Promise<PaneConfig | undefined> {
    return this.addPaneToEnd();
  }

  public async promptRemovePane(): Promise<boolean> {
    const visible = this.getVisiblePanes();
    if (visible.length <= 1) {
      void vscode.window.showWarningMessage?.('At least one pane must remain in the pipeline.');
      return false;
    }
    const picked = await vscode.window.showQuickPick(
      visible.map((p) => {
        const def = this.registry.tryGet(p.role);
        return {
          label: p.title,
          description: `Role: ${def?.title || p.role}`,
          id: p.id,
        };
      }),
      { placeHolder: 'Select pane to remove' },
    );
    if (!picked) {
      return false;
    }
    return this.removePane(picked.id);
  }

  public async addPaneToEnd(paneOrRole?: PaneConfig | PaneRole): Promise<PaneConfig | undefined> {
    const visible = this.getVisiblePanes();
    if (visible.length >= 6) {
      void vscode.window.showWarningMessage?.('Maximum of 6 panes supported in the pipeline.');
      return undefined;
    }

    let configToAdd: PaneConfig;
    if (typeof paneOrRole === 'string') {
      const def = this.registry.get(paneOrRole);
      configToAdd = def.defaultConfig('');
      configToAdd.visible = true;
      configToAdd.inputSource = 'previousPane';
    } else if (paneOrRole) {
      configToAdd = paneOrRole;
    } else {
      const rolePick = await this.promptRolePicker('Select New Pane Type');
      if (!rolePick) {
        return undefined;
      }
      const def = this.registry.get(rolePick.role);
      configToAdd = def.defaultConfig('');
      configToAdd.title = rolePick.label;
      configToAdd.visible = true;
      configToAdd.inputSource = 'previousPane';
    }

    const newVisible = [...visible, configToAdd];
    await this.applyVisiblePanes(newVisible);
    return configToAdd;
  }

  public async reorderSlots(slotOrder: string[]): Promise<boolean> {
    if (!slotOrder || slotOrder.length === 0) {
      return false;
    }
    const currentOrder = this.panes.map((p) => p.id);
    const orderChanged = slotOrder.some((id, idx) => currentOrder[idx] !== id);
    if (!orderChanged) {
      return false;
    }

    const slotMap = new Map<string, PaneConfig>();
    for (const pane of this.panes) {
      slotMap.set(pane.id, pane);
    }

    const orderedPanes: PaneConfig[] = [];
    for (const slotId of slotOrder) {
      const p = slotMap.get(slotId);
      if (p) {
        orderedPanes.push(p);
        slotMap.delete(slotId);
      }
    }
    for (const remaining of slotMap.values()) {
      orderedPanes.push(remaining);
    }

    this.panes = orderedPanes;
    const visible = this.getVisiblePanes();
    if (visible.length > 0 && visible[0].inputSource === 'previousPane') {
      visible[0].inputSource = 'project' as any;
    }

    await this.syncContextKeys();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
    return true;
  }

  public async configurePane(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const def = this.registry.get(pane.role);
    const caps = def.capabilities;

    const items: { label: string; description?: string; action: string }[] = [
      {
        label: '$(edit) Title...',
        description: pane.title,
        action: 'title',
      },
      {
        label: '$(symbol-class) Type...',
        description: `${def.title} (${def.description})`,
        action: 'type',
      },
    ];

    if (caps.supportedInputs.length > 1) {
      items.push({
        label: '$(sign-in) Input Source...',
        description: this.getInputSourceLabel(pane.inputSource),
        action: 'input',
      });
    }

    if (caps.supportedSelections.length > 1) {
      items.push({
        label: '$(check) Selection Source...',
        description: this.getSelectionSourceLabel(pane.selectionSource),
        action: 'selectionSource',
      });
    }

    if (caps.supportedSorts.length > 1) {
      items.push({
        label: '$(sort-precedence) Sort...',
        description: this.getSortLabel(pane.sort),
        action: 'sort',
      });
    }

    if (caps.hasFilter) {
      items.push({
        label: '$(filter) Filters...',
        description: 'Configure active filters',
        action: 'filter',
      });
    }

    if (caps.hasTreeToggle) {
      const isTree = Boolean((pane as any).tree);
      items.push({
        label: '$(list-tree) Tree Display...',
        description: isTree ? 'Yes (Tree)' : 'No (Flat List)',
        action: 'tree',
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Configure Pane: ${pane.title}`,
    });

    if (!picked || !picked.action) {
      return;
    }

    switch (picked.action) {
      case 'title':
        await this.configureTitle(slotId);
        break;
      case 'type':
        await this.configurePaneType(slotId);
        break;
      case 'input':
        await this.configureInputSource(slotId);
        break;
      case 'selectionSource':
        await this.configureSelectionSource(slotId);
        break;
      case 'sort':
        await this.configureSort(slotId);
        break;
      case 'filter':
      case 'filters':
      case 'globPattern':
        await this.configureFilter(slotId);
        break;
      case 'tree':
        await this.configureTreeDisplay(slotId);
        break;
    }
  }

  public async configureTitle(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const newTitle = await vscode.window.showInputBox({
      value: pane.title,
      prompt: 'Enter new pane title',
    });
    if (newTitle) {
      pane.title = newTitle;
      this._onDidUpdatePanes.fire();
    }
  }

  public async configurePaneType(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = idx === 0;

    const rolePick = await this.promptRolePicker('Select Pane Type');
    if (rolePick) {
      const def = this.registry.get(rolePick.role);
      const newPane = def.defaultConfig(pane.id);
      newPane.title = rolePick.label;
      newPane.inputSource = isFirstPane ? 'project' : pane.inputSource;
      newPane.visible = true;

      visible[idx] = newPane;
      await this.applyVisiblePanes(visible);
    }
  }

  public async configureInputSource(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const def = this.registry.get(pane.role);
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = idx === 0;

    const descriptions: Record<PaneInputSource, string> = {
      project: 'Workspace-wide files, directories, symbols, or issues',
      openEditors: 'Items from open editor tabs',
      activeEditor: 'Items from the active editor',
      previousPane: 'Items from preceding visible pane',
    };
    const labels: Record<PaneInputSource, string> = {
      project: 'Project',
      openEditors: 'Open Editors',
      activeEditor: 'Active Editor',
      previousPane: 'Previous Pane',
    };

    const inputOptions: { label: string; description: string; source: PaneInputSource }[] = [];
    for (const src of def.capabilities.supportedInputs) {
      if (src === 'previousPane' && isFirstPane) {
        continue;
      }
      inputOptions.push({
        label: labels[src] || src,
        description: descriptions[src] || src,
        source: src,
      });
    }

    const inputPick = await vscode.window.showQuickPick(inputOptions, {
      placeHolder: 'Select Input Source',
    });
    if (inputPick) {
      pane.inputSource = inputPick.source as any;
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
    }
  }

  public async configureSelectionSource(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const def = this.registry.get(pane.role);
    const labels: Record<SelectionSource, string> = {
      cursor: 'Cursor',
      all: 'All',
      none: 'None',
    };
    const descriptions: Record<SelectionSource, string> = {
      cursor: 'Active cursor symbol or file (selects item under cursor)',
      all: 'Select all items in this pane by default',
      none: 'Manual selection only',
    };

    const options = def.capabilities.supportedSelections.map((src) => ({
      label: labels[src] || src,
      description: descriptions[src] || src,
      source: src,
    }));

    const selPick = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select Selection Source',
    });
    if (selPick) {
      pane.selectionSource = selPick.source;
      this._onDidUpdatePanes.fire();
      this.coordinator.handlePaneSelectionSourceChange(pane.id);
    }
  }

  public async configureSort(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const def = this.registry.get(pane.role);
    const caps = def.capabilities;
    const sortDescriptions: Record<SortOption, string> = {
      name: 'Sort alphabetically by name',
      position: 'Sort by position in file or directory path',
      category: 'Group items by kind, category, or severity',
    };
    const sortOptions = caps.supportedSorts.map((sort) => ({
      label: sort.charAt(0).toUpperCase() + sort.slice(1),
      description: sortDescriptions[sort] || sort,
      sort,
    }));
    const sortPick = await vscode.window.showQuickPick(sortOptions, {
      placeHolder: 'Select Sort Order',
    });
    if (sortPick) {
      pane.sort = sortPick.sort as any;
      this._onDidUpdatePanes.fire();
      this.coordinator.refreshSlot(pane.id);
    }
  }

  public async configureFilter(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const def = this.registry.get(pane.role);
    if (def.configureFilter) {
      const context: PaneExecutionContext = {
        config: pane,
        slotId: pane.id,
        coordinator: this.coordinator,
        upstreamOutput: await this.getUpstreamOutput(pane.id),
      };
      const updated = await def.configureFilter(pane, context);
      if (updated) {
        this._onDidUpdatePanes.fire();
        this.coordinator.refreshSlot(pane.id);
      }
    }
  }

  public async toggleTreeDisplay(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane || !('tree' in pane)) {
      return;
    }
    (pane as any).tree = !(pane as any).tree;
    await this.syncContextKeys();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
  }

  public async configureTreeDisplay(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane || !('tree' in pane)) {
      return;
    }
    const current = Boolean((pane as any).tree);
    const options = [
      {
        label: '$(list-tree) Tree Hierarchy',
        description: 'Hierarchical tree with collapsible nodes',
        tree: true,
        picked: current === true,
      },
      {
        label: '$(list-flat) Flat List',
        description: 'Flat list of items',
        tree: false,
        picked: current === false,
      },
    ];
    const picked = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select Tree or Flat List Display',
    });
    if (picked) {
      (pane as any).tree = picked.tree;
      await this.syncContextKeys();
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
    }
  }

  public async applyPreset(presetName?: string): Promise<void> {
    if (presetName) {
      await this.loadPresetByName(presetName);
      return;
    }

    const items: (vscode.QuickPickItem & { action?: string; preset?: string })[] = [
      { label: 'Built-in Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(layout) Project Browser',
        description: 'Directories (Hierarchy) -> Files -> Symbols (Hierarchy) -> Members',
        preset: 'project',
      },
      {
        label: '$(edit) Active Editor',
        description: 'Symbols (Active Editor) -> Members -> Callers',
        preset: 'activeEditor',
      },
      {
        label: '$(git-pull-request) Working Changes',
        description: 'Changes (Git/Dirty) -> Symbols -> Members -> Problems',
        preset: 'workingChanges',
      },
      {
        label: '$(error) Problem Triage',
        description: 'Problems (Workspace) -> Symbols -> Members -> References',
        preset: 'problemTriage',
      },
      {
        label: '$(type-hierarchy-sub) Type Hierarchy',
        description: 'Hierarchy (Roots/Subtypes) -> Members -> Implementations',
        preset: 'typeHierarchy',
      },
      {
        label: '$(files) Open Editors',
        description: 'Open Files -> Symbols (Hierarchy) -> Members -> References',
        preset: 'openEditors',
      },
      { label: 'Custom Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(save) Save Current Preset...',
        description: 'Save current active pipeline to Workspace or Global settings',
        action: 'save',
      },
      {
        label: '$(folder-opened) Load Saved Preset...',
        description: 'Load a preset saved in Workspace or Global settings',
        action: 'load',
      },
      {
        label: '$(trash) Delete Saved Preset...',
        description: 'Remove a preset from Workspace or Global settings',
        action: 'delete',
      },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select Pane Pipeline Preset or Manage Presets',
    });

    if (!picked) {
      return;
    }

    if (picked.preset) {
      await this.loadBuiltinPreset(picked.preset);
      return;
    }

    if (picked.action === 'save') {
      await this.saveCustomPresetPrompt();
    } else if (picked.action === 'load') {
      await this.loadCustomPresetPrompt();
    } else if (picked.action === 'delete') {
      await this.deleteCustomPresetPrompt();
    }
  }

  public async loadPresetByName(presetName: string): Promise<void> {
    const norm = presetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm === 'projectbrowser' || norm === 'project') {
      await this.loadBuiltinPreset('project');
      return;
    }
    if (norm === 'activeeditor' || norm === 'activeeditorinspector' || norm === 'callers') {
      await this.loadBuiltinPreset('activeEditor');
      return;
    }
    if (norm === 'workingchanges' || norm === 'workingchangesreview' || norm === 'changes') {
      await this.loadBuiltinPreset('workingChanges');
      return;
    }
    if (norm === 'problemtriage' || norm === 'problems') {
      await this.loadBuiltinPreset('problemTriage');
      return;
    }
    if (norm === 'typehierarchy' || norm === 'hierarchy' || norm === 'implementors') {
      await this.loadBuiltinPreset('typeHierarchy');
      return;
    }
    if (norm === 'openeditors' || norm === 'references') {
      await this.loadBuiltinPreset('openEditors');
      return;
    }
    const saved = this.getSavedPresets();
    if (saved[presetName]) {
      await this.applyVisiblePanes(saved[presetName]);
    }
  }

  private async loadBuiltinPreset(preset: string): Promise<void> {
    const dirDef = this.registry.get('directories');
    const filesDef = this.registry.get('files');
    const symDef = this.registry.get('symbols');
    const hierDef = this.registry.get('hierarchy');
    const callersDef = this.registry.get('callers');
    const changesDef = this.registry.get('changes');
    const probDef = this.registry.get('problems');
    const refDef = this.registry.get('references');
    const implDef = this.registry.get('implementations');

    let newVisible: PaneConfig[];
    switch (preset) {
      case 'project':
      default: {
        const d = dirDef.defaultConfig('');
        d.title = 'Directories';
        d.tree = true;
        d.inputSource = 'project';
        d.selectionSource = 'cursor';

        const f = filesDef.defaultConfig('');
        f.title = 'Files';
        f.tree = false;
        f.inputSource = 'previousPane';
        f.selectionSource = 'cursor';

        const s1 = symDef.defaultConfig('');
        s1.title = 'Definitions';
        s1.tree = false;
        s1.inputSource = 'previousPane';
        s1.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = true;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'none';

        newVisible = [d, f, s1, s2];
        break;
      }
      case 'activeEditor':
      case 'callers': {
        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = 'activeEditor';
        s1.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'cursor';

        const c = callersDef.defaultConfig('');
        c.title = 'Callers';
        c.inputSource = 'previousPane';
        c.selectionSource = 'none';

        newVisible = [s1, s2, c];
        break;
      }
      case 'workingChanges':
      case 'changes': {
        const ch = changesDef.defaultConfig('');
        ch.title = 'Changes';
        ch.inputSource = 'project';
        ch.selectionSource = 'cursor';

        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = 'previousPane';
        s1.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'none';

        const pr = probDef.defaultConfig('');
        pr.title = 'Problems';
        pr.inputSource = 'previousPane';
        pr.selectionSource = 'none';

        newVisible = [ch, s1, s2, pr];
        break;
      }
      case 'problemTriage':
      case 'problems': {
        const pr = probDef.defaultConfig('');
        pr.title = 'Problems';
        pr.inputSource = 'project';
        pr.selectionSource = 'cursor';

        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = 'previousPane';
        s1.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'cursor';

        const ref = refDef.defaultConfig('');
        ref.title = 'References';
        ref.inputSource = 'previousPane';
        ref.selectionSource = 'none';

        newVisible = [pr, s1, s2, ref];
        break;
      }
      case 'typeHierarchy':
      case 'hierarchy':
      case 'implementors': {
        const h = hierDef.defaultConfig('');
        h.title = 'Hierarchy';
        h.tree = true;
        h.inputSource = 'project';
        h.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'cursor';

        const imp = implDef.defaultConfig('');
        imp.title = 'Implementations';
        imp.inputSource = 'previousPane';
        imp.selectionSource = 'none';

        newVisible = [h, s2, imp];
        break;
      }
      case 'openEditors':
      case 'references': {
        const f = filesDef.defaultConfig('');
        f.title = 'Open Files';
        f.tree = false;
        f.inputSource = 'openEditors';
        f.selectionSource = 'cursor';

        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = 'previousPane';
        s1.selectionSource = 'cursor';

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = 'previousPane';
        s2.selectionSource = 'none';

        const ref = refDef.defaultConfig('');
        ref.title = 'References';
        ref.inputSource = 'previousPane';
        ref.selectionSource = 'none';

        newVisible = [f, s1, s2, ref];
        break;
      }
    }

    await this.applyVisiblePanes(newVisible);
  }

  public getSavedPresets(scope?: 'workspace' | 'global'): Record<string, PaneConfig[]> {
    const config = vscode.workspace.getConfiguration('facet');
    const presets: Record<string, PaneConfig[]> = {};
    if (!scope || scope === 'global') {
      const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') || {};
      Object.assign(presets, globalPresets);
    }
    if (!scope || scope === 'workspace') {
      const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') || {};
      Object.assign(presets, wsPresets);
    }
    return presets;
  }

  public async savePreset(name: string, target: 'workspace' | 'global'): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const key = target === 'workspace' ? 'presets.workspace' : 'presets.global';
    const existing = config.get<Record<string, PaneConfig[]>>(key) || {};
    const visiblePanes = this.getVisiblePanes().map((p) => ({ ...p }));
    const updated = { ...existing, [name]: visiblePanes };
    const targetScope =
      target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update(key, updated, targetScope);
  }

  public async deletePreset(name: string, target: 'workspace' | 'global'): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const key = target === 'workspace' ? 'presets.workspace' : 'presets.global';
    const existing = config.get<Record<string, PaneConfig[]>>(key) || {};
    const updated = { ...existing };
    delete updated[name];
    const targetScope =
      target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update(key, updated, targetScope);
  }

  public async saveCustomPresetPrompt(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter a name for the new preset',
      placeHolder: 'e.g. My Workflow',
    });
    if (!name || !name.trim()) {
      return;
    }
    const scopePick = await vscode.window.showQuickPick(
      [
        { label: 'Workspace', description: 'Available only in this workspace', target: 'workspace' as const },
        { label: 'Global (User Settings)', description: 'Available across all workspaces', target: 'global' as const },
      ],
      { placeHolder: 'Select where to save the preset' },
    );
    if (!scopePick) {
      return;
    }
    await this.savePreset(name.trim(), scopePick.target);
    vscode.window.showInformationMessage(`Preset "${name.trim()}" saved to ${scopePick.label}.`);
  }

  public async loadCustomPresetPrompt(): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') || {};
    const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') || {};

    const items: (vscode.QuickPickItem & { preset: PaneConfig[] })[] = [];
    for (const [name, panes] of Object.entries(wsPresets)) {
      items.push({
        label: name,
        description: 'Workspace preset',
        preset: panes,
      });
    }
    for (const [name, panes] of Object.entries(globalPresets)) {
      if (!items.some((i) => i.label === name)) {
        items.push({
          label: name,
          description: 'Global preset',
          preset: panes,
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage('No saved presets found in workspace or global settings.');
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a saved preset to load',
    });
    if (picked) {
      await this.applyVisiblePanes(picked.preset);
    }
  }

  public async deleteCustomPresetPrompt(): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') || {};
    const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') || {};

    const items: (vscode.QuickPickItem & { name: string; target: 'workspace' | 'global' })[] = [];
    for (const name of Object.keys(wsPresets)) {
      items.push({
        label: name,
        description: 'Workspace',
        name,
        target: 'workspace',
      });
    }
    for (const name of Object.keys(globalPresets)) {
      items.push({
        label: name,
        description: 'Global',
        name,
        target: 'global',
      });
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage('No saved presets found in workspace or global settings.');
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a preset to delete',
    });
    if (picked) {
      await this.deletePreset(picked.name, picked.target);
      vscode.window.showInformationMessage(`Deleted preset "${picked.name}".`);
    }
  }

  private async promptRolePicker(placeHolder: string): Promise<{ role: PaneRole; label: string } | undefined> {
    const defs = this.registry.getAll();
    const items = defs.map((def) => ({
      label: `$(${def.icon}) ${def.title}`,
      description: def.description,
      role: def.role,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked ? { role: picked.role, label: picked.label } : undefined;
  }

  private getInputSourceLabel(source: PaneInputSource): string {
    switch (source) {
      case 'project':
        return 'Project';
      case 'openEditors':
        return 'Open Editors';
      case 'activeEditor':
        return 'Active Editor';
      case 'previousPane':
        return 'Previous Pane';
    }
  }

  private getSelectionSourceLabel(source: SelectionSource): string {
    switch (source) {
      case 'cursor':
        return 'Cursor';
      case 'all':
        return 'All';
      case 'none':
        return 'None';
    }
  }

  private getSortLabel(sort: SortOption): string {
    switch (sort) {
      case 'name':
        return 'Name';
      case 'position':
        return 'Position';
      case 'category':
        return 'Category';
    }
  }
}
