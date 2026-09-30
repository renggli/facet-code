import * as vscode from 'vscode';
import {
  createDefaultPanes,
  hasTreeProperty,
  type PaneConfig,
  PaneInputSource,
  PaneRole,
  SortOption,
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
    this.registry = registry ?? coordinator.registry;
    this.panes = initialPanes ?? createDefaultPanes();
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
    const allRoles: PaneRole[] = Object.values(PaneRole);
    const visibleRoles = new Set(this.getVisiblePanes().map((p) => p.role));

    const contextPromises: Thenable<unknown>[] = [];
    for (const pane of this.panes) {
      contextPromises.push(vscode.commands.executeCommand('setContext', `${pane.id}.visible`, pane.visible));
      const def = this.registry.tryGet(pane.role);
      const hasTree = Boolean(def?.capabilities.hasTreeToggle);
      const isTree = hasTree && hasTreeProperty(pane) ? Boolean(pane.tree) : false;
      const hasFilter = Boolean(def?.capabilities.hasFilter);
      const isPinned = Boolean(pane.pinned);

      contextPromises.push(
        vscode.commands.executeCommand('setContext', `${pane.id}.hasTree`, hasTree),
        vscode.commands.executeCommand('setContext', `${pane.id}.isTree`, isTree),
        vscode.commands.executeCommand('setContext', `${pane.id}.hasFilter`, hasFilter),
        vscode.commands.executeCommand('setContext', `${pane.id}.isPinned`, isPinned),
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
    if (!newVisible || newVisible.length === 0) {
      return;
    }
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

      if (i === 0 && p.inputSource === PaneInputSource.PreviousPane) {
        p.inputSource = PaneInputSource.Project;
      }
      updatedPanes.push(p);
    }

    const defaultDef = this.registry.get(PaneRole.Symbols);
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
          description: `Role: ${def?.title ?? p.role}`,
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
      configToAdd.inputSource = PaneInputSource.PreviousPane;
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
      configToAdd.inputSource = PaneInputSource.PreviousPane;
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
    if (visible.length > 0 && visible[0].inputSource === PaneInputSource.PreviousPane) {
      visible[0].inputSource = PaneInputSource.Project;
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
    const visible = this.getVisiblePanes();
    const isFirstPane = visible[0]?.id === slotId;

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

    if (isFirstPane && caps.supportedInputs.length > 1) {
      items.push({
        label: '$(sign-in) Input Source...',
        description: this.getInputSourceLabel(pane.inputSource),
        action: 'input',
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

    if (caps.hasTreeToggle && hasTreeProperty(pane)) {
      const isTree = Boolean(pane.tree);
      items.push({
        label: '$(list-tree) Tree Display...',
        description: isTree ? 'Yes (Tree)' : 'No (Flat List)',
        action: 'tree',
      });
    }

    const isPinned = Boolean(pane.pinned);
    items.push({
      label: isPinned ? '$(pinned) Unpin Pane' : '$(pin) Pin Pane',
      description: isPinned
        ? 'Allow selection changes to affect this pane'
        : 'Prevent selection changes from affecting this pane',
      action: 'pin',
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Configure Pane: ${pane.title}`,
    });

    if (!picked?.action) {
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
      case 'pin':
        await this.togglePin(slotId);
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
      newPane.inputSource = isFirstPane ? PaneInputSource.Project : pane.inputSource;
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
    if (idx !== 0) {
      return;
    }
    const isFirstPane = true;

    const descriptions: Record<PaneInputSource, string> = {
      [PaneInputSource.Project]: 'Workspace-wide files, directories, symbols, or issues',
      [PaneInputSource.OpenEditors]: 'Items from open editor tabs',
      [PaneInputSource.ActiveEditor]: 'Items from the active editor',
      [PaneInputSource.PreviousPane]: 'Items from preceding visible pane',
    };
    const labels: Record<PaneInputSource, string> = {
      [PaneInputSource.Project]: 'Project',
      [PaneInputSource.OpenEditors]: 'Open Editors',
      [PaneInputSource.ActiveEditor]: 'Active Editor',
      [PaneInputSource.PreviousPane]: 'Previous Pane',
    };

    const inputOptions: { label: string; description: string; source: PaneInputSource }[] = [];
    for (const src of def.capabilities.supportedInputs) {
      if (src === PaneInputSource.PreviousPane && isFirstPane) {
        continue;
      }
      inputOptions.push({
        label: labels[src] ?? src,
        description: descriptions[src] ?? src,
        source: src,
      });
    }

    const inputPick = await vscode.window.showQuickPick(inputOptions, {
      placeHolder: 'Select Input Source',
    });
    if (inputPick) {
      pane.inputSource = inputPick.source;
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
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
      [SortOption.Name]: 'Sort alphabetically by name',
      [SortOption.Position]: 'Sort by position in file or directory path',
      [SortOption.Category]: 'Group items by kind, category, or severity',
    };
    const sortOptions = caps.supportedSorts.map((sort) => ({
      label: sort.charAt(0).toUpperCase() + sort.slice(1),
      description: sortDescriptions[sort] ?? sort,
      sort,
    }));
    const sortPick = await vscode.window.showQuickPick(sortOptions, {
      placeHolder: 'Select Sort Order',
    });
    if (sortPick) {
      pane.sort = sortPick.sort;
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
    if (!pane || !hasTreeProperty(pane)) {
      return;
    }
    pane.tree = !pane.tree;
    await this.syncContextKeys();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
  }

  public async configureTreeDisplay(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane || !hasTreeProperty(pane)) {
      return;
    }
    const current = Boolean(pane.tree);
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
      pane.tree = picked.tree;
      await this.syncContextKeys();
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
    }
  }

  public getDependentPanes(slotId: string): PaneConfig[] {
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx <= 0) {
      return [];
    }
    const dependents: PaneConfig[] = [];
    for (let i = idx - 1; i >= 0; i--) {
      if (visible[i + 1].inputSource === 'previousPane') {
        dependents.push(visible[i]);
      } else {
        break;
      }
    }
    return dependents;
  }

  public getDownstreamPanes(slotId: string): PaneConfig[] {
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx === -1 || idx >= visible.length - 1) {
      return [];
    }
    const downstream: PaneConfig[] = [];
    for (let i = idx + 1; i < visible.length; i++) {
      if (visible[i].inputSource === 'previousPane') {
        downstream.push(visible[i]);
      } else {
        break;
      }
    }
    return downstream;
  }

  public async setPinned(slotId: string, pinned: boolean, cascade = true): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    pane.pinned = pinned;
    if (pinned) {
      if (pane.inputSource === 'activeEditor') {
        const curUri = this.coordinator.getCurrentEditor()?.document.uri.toString();
        if (curUri) {
          pane.pinnedUri = curUri;
        }
      }
    } else {
      pane.pinnedUri = undefined;
    }

    if (cascade) {
      const dependents = this.getDependentPanes(slotId);
      for (const dep of dependents) {
        dep.pinned = pinned;
        if (pinned) {
          if (dep.inputSource === 'activeEditor') {
            const curUri = this.coordinator.getCurrentEditor()?.document.uri.toString();
            if (curUri) {
              dep.pinnedUri = curUri;
            }
          }
        } else {
          dep.pinnedUri = undefined;
        }
      }
    }

    await this.syncContextKeys();
    this._onDidUpdatePanes.fire();
    if (!pinned) {
      await this.coordinator.sync();
    }
  }

  public async togglePin(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    await this.setPinned(slotId, !pane.pinned);
  }

  public async applyPreset(presetName?: string): Promise<void> {
    if (presetName) {
      await this.loadPresetByName(presetName);
      return;
    }

    const items: (vscode.QuickPickItem & { action?: string; preset?: string })[] = [
      { label: 'Built-in Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(layout) Workspace Explorer',
        description: 'Directories (Hierarchy) -> Files -> Definitions (Flat) -> Members (Hierarchy)',
        preset: 'workspaceExplorer',
      },
      {
        label: '$(edit) Active Editor',
        description: 'Definitions (Flat) -> Members (Hierarchy) -> Callers',
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
        description: 'Open Files -> Definitions (Flat) -> Members (Hierarchy) -> References',
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
    if (norm === 'workspaceexplorer' || norm === 'projectbrowser') {
      await this.loadBuiltinPreset('workspaceExplorer');
      return;
    }
    if (norm === 'activeeditor') {
      await this.loadBuiltinPreset('activeEditor');
      return;
    }
    if (norm === 'workingchanges') {
      await this.loadBuiltinPreset('workingChanges');
      return;
    }
    if (norm === 'problemtriage') {
      await this.loadBuiltinPreset('problemTriage');
      return;
    }
    if (norm === 'typehierarchy') {
      await this.loadBuiltinPreset('typeHierarchy');
      return;
    }
    if (norm === 'openeditors') {
      await this.loadBuiltinPreset('openEditors');
      return;
    }
    const saved = this.getSavedPresets();
    if (Object.hasOwn(saved, presetName) && Array.isArray(saved[presetName])) {
      await this.applyVisiblePanes(saved[presetName]);
    }
  }

  public getSavedPresets(scope?: 'workspace' | 'global'): Record<string, PaneConfig[]> {
    const config = vscode.workspace.getConfiguration('facet');
    const presets: Record<string, PaneConfig[]> = {};
    if (!scope || scope === 'global') {
      const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') ?? {};
      Object.assign(presets, globalPresets);
    }
    if (!scope || scope === 'workspace') {
      const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') ?? {};
      Object.assign(presets, wsPresets);
    }
    return presets;
  }

  public async savePreset(name: string, target: 'workspace' | 'global'): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const key = target === 'workspace' ? 'presets.workspace' : 'presets.global';
    const existing = config.get<Record<string, PaneConfig[]>>(key) ?? {};
    const visiblePanes = this.getVisiblePanes().map((p) => ({ ...p }));
    const updated = { ...existing, [name]: visiblePanes };
    const targetScope =
      target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update(key, updated, targetScope);
  }

  public async deletePreset(name: string, target: 'workspace' | 'global'): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const key = target === 'workspace' ? 'presets.workspace' : 'presets.global';
    const existing = config.get<Record<string, PaneConfig[]>>(key) ?? {};
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
    const trimmedName = name?.trim();
    if (!trimmedName) {
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
    await this.savePreset(trimmedName, scopePick.target);
    vscode.window.showInformationMessage(`Preset "${trimmedName}" saved to ${scopePick.label}.`);
  }

  public async loadCustomPresetPrompt(): Promise<void> {
    const config = vscode.workspace.getConfiguration('facet');
    const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') ?? {};
    const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') ?? {};

    const items: (vscode.QuickPickItem & { preset: PaneConfig[] })[] = [];
    for (const [name, panes] of Object.entries(wsPresets)) {
      if (Array.isArray(panes) && panes.length > 0) {
        items.push({
          label: name,
          description: 'Workspace preset',
          preset: panes,
        });
      }
    }
    for (const [name, panes] of Object.entries(globalPresets)) {
      if (Array.isArray(panes) && panes.length > 0 && !items.some((i) => i.label === name)) {
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
    const wsPresets = config.get<Record<string, PaneConfig[]>>('presets.workspace') ?? {};
    const globalPresets = config.get<Record<string, PaneConfig[]>>('presets.global') ?? {};

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

  // --- Private Helpers at Bottom ---

  private async loadBuiltinPreset(preset: string): Promise<void> {
    const dirDef = this.registry.get(PaneRole.Directories);
    const filesDef = this.registry.get(PaneRole.Files);
    const symDef = this.registry.get(PaneRole.Symbols);
    const hierDef = this.registry.get(PaneRole.Hierarchy);
    const callersDef = this.registry.get(PaneRole.Callers);
    const changesDef = this.registry.get(PaneRole.Changes);
    const probDef = this.registry.get(PaneRole.Problems);
    const refDef = this.registry.get(PaneRole.References);
    const implDef = this.registry.get(PaneRole.Implementations);

    let newVisible: PaneConfig[];
    switch (preset) {
      case 'activeEditor': {
        const s1 = symDef.defaultConfig('');
        s1.title = 'Definitions';
        s1.tree = false;
        s1.inputSource = PaneInputSource.ActiveEditor;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = true;
        s2.inputSource = PaneInputSource.PreviousPane;

        const c = callersDef.defaultConfig('');
        c.title = 'Callers';
        c.inputSource = PaneInputSource.PreviousPane;

        newVisible = [s1, s2, c];
        break;
      }
      case 'workingChanges': {
        const ch = changesDef.defaultConfig('');
        ch.title = 'Changes';
        ch.inputSource = PaneInputSource.Project;

        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = PaneInputSource.PreviousPane;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = PaneInputSource.PreviousPane;

        const pr = probDef.defaultConfig('');
        pr.title = 'Problems';
        pr.inputSource = PaneInputSource.PreviousPane;

        newVisible = [ch, s1, s2, pr];
        break;
      }
      case 'problemTriage': {
        const pr = probDef.defaultConfig('');
        pr.title = 'Problems';
        pr.inputSource = PaneInputSource.Project;

        const s1 = symDef.defaultConfig('');
        s1.title = 'Symbols';
        s1.tree = true;
        s1.inputSource = PaneInputSource.PreviousPane;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = PaneInputSource.PreviousPane;

        const ref = refDef.defaultConfig('');
        ref.title = 'References';
        ref.inputSource = PaneInputSource.PreviousPane;

        newVisible = [pr, s1, s2, ref];
        break;
      }
      case 'typeHierarchy': {
        const h = hierDef.defaultConfig('');
        h.title = 'Hierarchy';
        h.tree = true;
        h.inputSource = PaneInputSource.Project;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = false;
        s2.inputSource = PaneInputSource.PreviousPane;

        const imp = implDef.defaultConfig('');
        imp.title = 'Implementations';
        imp.inputSource = PaneInputSource.PreviousPane;

        newVisible = [h, s2, imp];
        break;
      }
      case 'openEditors': {
        const f = filesDef.defaultConfig('');
        f.title = 'Open Files';
        f.tree = false;
        f.inputSource = PaneInputSource.OpenEditors;

        const s1 = symDef.defaultConfig('');
        s1.title = 'Definitions';
        s1.tree = false;
        s1.inputSource = PaneInputSource.PreviousPane;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = true;
        s2.inputSource = PaneInputSource.PreviousPane;

        const ref = refDef.defaultConfig('');
        ref.title = 'References';
        ref.inputSource = PaneInputSource.PreviousPane;

        newVisible = [f, s1, s2, ref];
        break;
      }
      default: {
        // workspaceExplorer (default preset, formerly projectBrowser)
        const d = dirDef.defaultConfig('');
        d.title = 'Directories';
        d.tree = true;
        d.inputSource = PaneInputSource.Project;
        d.sort = SortOption.Name;

        const f = filesDef.defaultConfig('');
        f.title = 'Files';
        f.tree = false;
        f.inputSource = PaneInputSource.PreviousPane;
        f.sort = SortOption.Name;

        const s1 = symDef.defaultConfig('');
        s1.title = 'Definitions';
        s1.tree = false;
        s1.inputSource = PaneInputSource.PreviousPane;
        s1.sort = SortOption.Category;

        const s2 = symDef.defaultConfig('');
        s2.title = 'Members';
        s2.tree = true;
        s2.inputSource = PaneInputSource.PreviousPane;
        s2.sort = SortOption.Category;

        newVisible = [d, f, s1, s2];
        break;
      }
    }

    await this.applyVisiblePanes(newVisible);
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
      case PaneInputSource.Project:
        return 'Project';
      case PaneInputSource.OpenEditors:
        return 'Open Editors';
      case PaneInputSource.ActiveEditor:
        return 'Active Editor';
      case PaneInputSource.PreviousPane:
        return 'Previous Pane';
    }
  }

  private getSortLabel(sort: SortOption): string {
    switch (sort) {
      case SortOption.Name:
        return 'Name';
      case SortOption.Position:
        return 'Position';
      case SortOption.Category:
        return 'Category';
    }
  }
}
