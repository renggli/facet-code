import * as vscode from 'vscode';
import {
  ALL_SYMBOL_FILTER_OPTIONS,
  createCallersPane,
  createChangesPane,
  createDefaultPanes,
  createDirectoriesPane,
  createFilesPane,
  createHierarchyPane,
  createImplementationsPane,
  createMembersPane,
  createPaneByRole,
  createProblemsPane,
  createReferencesPane,
  createTypesPane,
  type DisplayMode,
  MEMBER_FILTER_KEYS,
  type PaneConfig,
  type PaneInputSource,
  type PaneRole,
  type SelectionSource,
  type SortOption,
  type SymbolKindKey,
  TYPE_FILTER_KEYS,
} from '../models/paneConfig';
import type { FacetCoordinator } from './facetCoordinator';

export class PanePipelineManager {
  private panes: PaneConfig[];

  private _onDidUpdatePanes = new vscode.EventEmitter<void>();
  readonly onDidUpdatePanes = this._onDidUpdatePanes.event;

  constructor(
    private readonly coordinator: FacetCoordinator,
    initialPanes?: PaneConfig[],
  ) {
    this.panes = initialPanes || createDefaultPanes();
    this.coordinator.setPipelineManager(this);
    this.syncContextKeys();
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
      'types',
      'members',
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

    await Promise.all([
      ...this.panes.map((pane) => vscode.commands.executeCommand('setContext', `${pane.id}.visible`, pane.visible)),
      ...allRoles.map((role) =>
        vscode.commands.executeCommand('setContext', `facet.role.${role}.visible`, visibleRoles.has(role)),
      ),
    ]);
  }

  public async applyVisiblePanes(newVisible: PaneConfig[], reveal = true): Promise<void> {
    const totalSlots = 6;
    const clampedVisible = newVisible.slice(0, totalSlots);

    // Maintain visual slot order from current this.panes
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

      // If the first visible pane was set to previousPane, default it to project/activeEditor
      if (i === 0 && p.inputSource === 'previousPane') {
        p.inputSource = (p.role === 'members' ? 'openEditors' : 'project') as any;
      }
      updatedPanes.push(p);
    }

    for (let i = clampedVisible.length; i < totalSlots; i++) {
      const slotId = visualSlotOrder[i];
      const hiddenPane = createMembersPane(slotId, { visible: false });
      updatedPanes.push(hiddenPane);
    }

    this.panes = updatedPanes;
    await this.syncContextKeys();
    this.coordinator.clearSlotSelections();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();

    if (reveal) {
      for (let i = clampedVisible.length - 1; i >= 0; i--) {
        try {
          await vscode.commands.executeCommand(`${clampedVisible[i].id}.focus`);
        } catch {
          // ignore focus error
        }
      }
    }
  }

  public async addPaneToEnd(role?: PaneRole): Promise<PaneConfig | undefined> {
    const visible = this.getVisiblePanes();
    if (visible.length >= 6) {
      void vscode.window.showWarningMessage?.('Maximum number of native panes (6) reached.');
      return undefined;
    }

    let targetRole = role;
    let label = '';
    if (!targetRole) {
      const rolePick = await this.promptRolePicker('Select Role for New Pane');
      if (!rolePick) {
        return undefined;
      }
      targetRole = rolePick.role;
      label = rolePick.label;
    } else {
      label = this.getRoleLabel(targetRole);
    }

    const defaultInput: PaneInputSource = visible.length === 0 ? 'project' : 'previousPane';
    const newPane = createPaneByRole(targetRole, '', {
      title: label,
      inputSource: defaultInput,
      selectionSource: 'none',
      visible: true,
    });

    visible.push(newPane);
    await this.applyVisiblePanes(visible);
    return newPane;
  }

  public async removePane(slotId: string): Promise<boolean> {
    const visible = this.getVisiblePanes();
    if (visible.length <= 1) {
      void vscode.window.showWarningMessage?.('At least one pane must remain in the pipeline.');
      return false;
    }

    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx === -1) {
      return false;
    }

    visible.splice(idx, 1);
    await this.applyVisiblePanes(visible);
    return true;
  }

  public async reorderSlots(slotOrder: string[]): Promise<boolean> {
    const visible = this.getVisiblePanes();
    const visibleIds = visible.map((p) => p.id);

    const orderedVisibleIds = slotOrder.filter((id) => visibleIds.includes(id));
    for (const id of visibleIds) {
      if (!orderedVisibleIds.includes(id)) {
        orderedVisibleIds.push(id);
      }
    }

    const unchanged = orderedVisibleIds.every((id, idx) => id === visibleIds[idx]);
    if (unchanged) {
      return false;
    }

    const newVisible = orderedVisibleIds.map((id) => visible.find((p) => p.id === id)!);
    const hiddenIds = slotOrder.filter((id) => !visibleIds.includes(id));
    const allKnownIds = [
      'facet.pane.1',
      'facet.pane.2',
      'facet.pane.3',
      'facet.pane.4',
      'facet.pane.5',
      'facet.pane.6',
    ];
    for (const id of allKnownIds) {
      if (!visibleIds.includes(id) && !hiddenIds.includes(id)) {
        hiddenIds.push(id);
      }
    }
    const hiddenPanes = hiddenIds.map(
      (id) => this.panes.find((p) => p.id === id) || createMembersPane(id, { visible: false }),
    );

    if (newVisible.length > 0 && newVisible[0].inputSource === 'previousPane') {
      newVisible[0].inputSource = (newVisible[0].role === 'members' ? 'openEditors' : 'project') as any;
    }

    this.panes = [...newVisible, ...hiddenPanes];
    await this.syncContextKeys();
    this.coordinator.clearSlotSelections();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
    return true;
  }

  public async configurePane(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }

    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = idx === 0;

    const items: (vscode.QuickPickItem & { action?: string })[] = [
      { label: 'Pane Settings', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(edit) Title',
        description: pane.title,
        action: 'title',
      },
      {
        label: '$(symbol-class) Type of Pane',
        description: `Current: ${this.getRoleLabel(pane.role)}`,
        action: 'type',
      },
      {
        label: '$(sign-in) Input Source',
        description: `Current: ${this.getInputLabel(pane.inputSource)}`,
        action: 'input',
      },
      {
        label: '$(inspect) Selection Source',
        description: `Current: ${this.getSelectionSourceLabel(pane.selectionSource)}`,
        action: 'selectionSource',
      },
      {
        label: '$(sort-precedence) Sort',
        description: `Current: ${this.getSortLabel(pane.sort)}`,
        action: 'sort',
      },
    ];

    if (pane.role === 'files' || pane.role === 'directories') {
      const currentPat = 'globPattern' in pane ? pane.globPattern : undefined;
      items.push({
        label: '$(filter) Filter (Glob Pattern)...',
        description: currentPat ? currentPat : 'None',
        action: 'globPattern',
      });
    }

    if (
      pane.role === 'types' ||
      pane.role === 'members' ||
      pane.role === 'definitions' ||
      pane.role === 'declarations' ||
      pane.role === 'implementations' ||
      pane.role === 'references' ||
      pane.role === 'hierarchy'
    ) {
      items.push({
        label: '$(filter) Filters...',
        description: this.getFiltersSummary(pane as any),
        action: 'filters',
      });
    }

    if (
      pane.role === 'files' ||
      pane.role === 'directories' ||
      pane.role === 'types' ||
      pane.role === 'members' ||
      pane.role === 'hierarchy'
    ) {
      let dispDesc = 'Flat';
      if ('display' in pane) {
        if (pane.display === 'hierarchy') {
          dispDesc = 'Hierarchy';
        } else if (pane.display === 'current') {
          dispDesc = 'Current (Inputs/Top-level)';
        }
      }
      items.push({
        label: '$(list-tree) Display Mode...',
        description: dispDesc,
        action: 'display',
      });
      if ('subclassTypes' in pane && pane.display === 'hierarchy') {
        items.push({
          label: '$(type-hierarchy-sub) Subclass Kinds...',
          description: (pane.subclassTypes || ['class', 'struct']).join(', '),
          action: 'subclassTypes',
        });
      }
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Configure Pane: ${pane.title}`,
    });

    if (!picked || !picked.action) {
      return;
    }

    switch (picked.action) {
      case 'title': {
        const newTitle = await vscode.window.showInputBox({
          value: pane.title,
          prompt: 'Enter new pane title',
        });
        if (newTitle) {
          pane.title = newTitle;
          this._onDidUpdatePanes.fire();
        }
        break;
      }
      case 'type': {
        await this.configurePaneType(slotId);
        break;
      }
      case 'input': {
        await this.configureInputSource(slotId);
        break;
      }
      case 'selectionSource': {
        await this.configureSelectionSource(slotId);
        break;
      }
      case 'sort': {
        await this.configureSort(slotId);
        break;
      }
      case 'globPattern':
      case 'filters': {
        await this.configureFilter(slotId);
        break;
      }
      case 'display': {
        await this.configureDisplayMode(slotId);
        break;
      }
      case 'subclassTypes': {
        await this.configureSubclassTypes(slotId);
        break;
      }
    }
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
      visible.map((p) => ({
        label: p.title,
        description: `Role: ${this.getRoleLabel(p.role)}`,
        id: p.id,
      })),
      { placeHolder: 'Select pane to remove' },
    );
    if (!picked) {
      return false;
    }
    return this.removePane(picked.id);
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
      const newPane = createPaneByRole(rolePick.role, pane.id, {
        title: rolePick.label,
        inputSource: isFirstPane ? (rolePick.role === 'members' ? 'openEditors' : 'project') : pane.inputSource,
        visible: true,
      });
      visible[idx] = newPane;
      await this.applyVisiblePanes(visible);
    }
  }

  public async configureInputSource(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }
    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = idx === 0;

    const inputOptions: { label: string; description: string; source: PaneInputSource }[] = [];
    if (['files', 'directories', 'types', 'problems', 'changes'].includes(pane.role)) {
      inputOptions.push({
        label: 'Project',
        description: 'Workspace-wide files, directories, symbols, or issues',
        source: 'project',
      });
    }
    if (['files', 'directories', 'types', 'members', 'problems', 'changes'].includes(pane.role)) {
      inputOptions.push({
        label: 'Open Editors',
        description: 'Items from open editor tabs',
        source: 'openEditors',
      });
      inputOptions.push({
        label: 'Active Editor',
        description: 'Items from the active editor',
        source: 'activeEditor',
      });
    }
    if (!isFirstPane) {
      inputOptions.push({
        label: 'Previous Pane',
        description: 'Items from preceding visible pane',
        source: 'previousPane',
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
    const options: { label: string; description: string; source: SelectionSource }[] = [];
    if (['files', 'directories', 'types', 'members', 'problems', 'changes'].includes(pane.role)) {
      options.push({
        label: 'Cursor',
        description: 'Active cursor symbol or file (selects item under cursor)',
        source: 'cursor',
      });
    }
    options.push(
      {
        label: 'All',
        description: 'Select all items in this pane by default',
        source: 'all',
      },
      {
        label: 'None',
        description: 'Manual selection only',
        source: 'none',
      },
    );
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
    const sortOptions: { label: string; description: string; sort: SortOption }[] = [
      {
        label: 'Name',
        description: 'Sort alphabetically by name',
        sort: 'name',
      },
      {
        label: 'Position',
        description: 'Sort by position in file or directory path',
        sort: 'position',
      },
    ];
    if (pane.role === 'types' || pane.role === 'members' || pane.role === 'hierarchy' || pane.role === 'problems') {
      sortOptions.push({
        label: 'Category',
        description: 'Group items by kind, category, or severity',
        sort: 'category',
      });
    }
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
    if (pane.role === 'files' || pane.role === 'directories') {
      const currentVal = ('globPattern' in pane && pane.globPattern) || '';
      const pattern = await vscode.window.showInputBox({
        value: currentVal,
        prompt: 'Enter glob pattern on full path (e.g. src/**/*.ts, !*test*)',
        placeHolder: 'e.g. src/**/*.ts',
      });
      if (pattern !== undefined) {
        const trimmed = pattern.trim() || undefined;
        (pane as any).globPattern = trimmed;
        this._onDidUpdatePanes.fire();
        this.coordinator.refreshSlot(pane.id);
      }
    } else if (
      pane.role === 'types' ||
      pane.role === 'members' ||
      pane.role === 'definitions' ||
      pane.role === 'declarations' ||
      pane.role === 'implementations' ||
      pane.role === 'references' ||
      pane.role === 'hierarchy'
    ) {
      await this.configureFilters(pane as any);
    }
  }

  public async configureDisplayMode(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane || !('display' in pane)) {
      return;
    }
    const displayOptions: { label: string; description: string; mode: DisplayMode }[] = [];
    if (pane.role === 'files' || pane.role === 'directories') {
      displayOptions.push({
        label: 'Current',
        description: 'Shows inputs / top-level project items (non-recursive)',
        mode: 'current' as DisplayMode,
      });
    }
    displayOptions.push(
      {
        label: 'Flat',
        description: 'Recursively traverses and flattens',
        mode: 'flat' as DisplayMode,
      },
      {
        label: 'Hierarchy',
        description: 'Tree hierarchy structure',
        mode: 'hierarchy' as DisplayMode,
      },
    );
    const dispPick = await vscode.window.showQuickPick(displayOptions, {
      placeHolder: 'Select Display Mode',
    });
    if (dispPick) {
      pane.display = dispPick.mode;
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
    }
  }

  public async configureSubclassTypes(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane || !('subclassTypes' in pane)) {
      return;
    }
    const current = pane.subclassTypes || ['class', 'struct'];
    const subclassOptions = [
      { label: 'Class', key: 'class' as SymbolKindKey, picked: current.includes('class') },
      { label: 'Interface', key: 'interface' as SymbolKindKey, picked: current.includes('interface') },
      { label: 'Struct', key: 'struct' as SymbolKindKey, picked: current.includes('struct') },
      { label: 'Enum', key: 'enum' as SymbolKindKey, picked: current.includes('enum') },
    ];
    const selected = await vscode.window.showQuickPick(subclassOptions, {
      canPickMany: true,
      placeHolder: 'Select what types to show as subclasses',
    });
    if (selected) {
      pane.subclassTypes = selected.map((s) => s.key);
      this._onDidUpdatePanes.fire();
      await this.coordinator.sync();
    }
  }

  private async configureFilters(pane: PaneConfig & { filters?: Record<string, boolean | undefined> }): Promise<void> {
    if (!pane.filters) {
      pane.filters = {};
    }
    const filterOptions = ALL_SYMBOL_FILTER_OPTIONS.map((opt) => {
      return {
        label: opt.label,
        key: opt.key,
        picked: pane.filters![opt.key] !== false,
      };
    });

    const selected = await vscode.window.showQuickPick(filterOptions, {
      canPickMany: true,
      placeHolder: 'Toggle symbol filters across 26 kinds (checked = visible)',
    });

    if (selected) {
      const selectedKeys = new Set(selected.map((s) => s.key));
      for (const opt of filterOptions) {
        pane.filters[opt.key] = selectedKeys.has(opt.key);
      }
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
        description: 'Directories (Hierarchy) -> Files -> Types (Hierarchy) -> Members',
        preset: 'project',
      },
      {
        label: '$(edit) Active Editor',
        description: 'Types (Active Editor) -> Members -> Callers',
        preset: 'activeEditor',
      },
      {
        label: '$(git-pull-request) Working Changes',
        description: 'Changes (Git/Dirty) -> Types -> Members -> Problems',
        preset: 'workingChanges',
      },
      {
        label: '$(error) Problem Triage',
        description: 'Problems (Workspace) -> Types -> Members -> References',
        preset: 'problemTriage',
      },
      {
        label: '$(type-hierarchy-sub) Type Hierarchy',
        description: 'Hierarchy (Roots/Subtypes) -> Members -> Implementations',
        preset: 'typeHierarchy',
      },
      {
        label: '$(files) Open Editors',
        description: 'Open Files -> Types (Hierarchy) -> Members -> References',
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

  private async loadPresetByName(presetName: string): Promise<void> {
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
    // Check saved presets
    const saved = this.getSavedPresets();
    if (saved[presetName]) {
      await this.applyVisiblePanes(saved[presetName]);
    }
  }

  private async loadBuiltinPreset(preset: string): Promise<void> {
    let newVisible: PaneConfig[];
    switch (preset) {
      case 'project':
      default:
        newVisible = [
          createDirectoriesPane('', {
            title: 'Directories',
            display: 'hierarchy',
            inputSource: 'project',
            selectionSource: 'cursor',
          }),
          createFilesPane('', {
            title: 'Files',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createTypesPane('', {
            title: 'Types',
            display: 'hierarchy',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'none',
          }),
        ];
        break;
      case 'activeEditor':
      case 'callers':
        newVisible = [
          createTypesPane('', {
            title: 'Types',
            display: 'hierarchy',
            inputSource: 'activeEditor',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createCallersPane('', { title: 'Callers', inputSource: 'previousPane', selectionSource: 'none' }),
        ];
        break;
      case 'workingChanges':
      case 'changes':
        newVisible = [
          createChangesPane('', { title: 'Changes', inputSource: 'project', selectionSource: 'cursor' }),
          createTypesPane('', {
            title: 'Types',
            display: 'hierarchy',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'none',
          }),
          createProblemsPane('', { title: 'Problems', inputSource: 'previousPane', selectionSource: 'none' }),
        ];
        break;
      case 'problemTriage':
      case 'problems':
        newVisible = [
          createProblemsPane('', { title: 'Problems', inputSource: 'project', selectionSource: 'cursor' }),
          createTypesPane('', {
            title: 'Types',
            display: 'hierarchy',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createReferencesPane('', { title: 'References', inputSource: 'previousPane', selectionSource: 'none' }),
        ];
        break;
      case 'typeHierarchy':
      case 'hierarchy':
      case 'implementors':
        newVisible = [
          createHierarchyPane('', {
            title: 'Hierarchy',
            display: 'hierarchy',
            inputSource: 'project',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createImplementationsPane('', {
            title: 'Implementations',
            inputSource: 'previousPane',
            selectionSource: 'none',
          }),
        ];
        break;
      case 'openEditors':
      case 'references':
        newVisible = [
          createFilesPane('', {
            title: 'Open Files',
            display: 'flat',
            inputSource: 'openEditors',
            selectionSource: 'cursor',
          }),
          createTypesPane('', {
            title: 'Types',
            display: 'hierarchy',
            inputSource: 'previousPane',
            selectionSource: 'cursor',
          }),
          createMembersPane('', {
            title: 'Members',
            display: 'flat',
            inputSource: 'previousPane',
            selectionSource: 'none',
          }),
          createReferencesPane('', { title: 'References', inputSource: 'previousPane', selectionSource: 'none' }),
        ];
        break;
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
      vscode.window.showInformationMessage('No saved presets to delete.');
      return;
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select preset to delete',
    });
    if (picked) {
      await this.deletePreset(picked.name, picked.target);
      vscode.window.showInformationMessage(`Deleted preset "${picked.name}".`);
    }
  }

  private async promptRolePicker(placeholder: string): Promise<{ label: string; role: PaneRole } | undefined> {
    return vscode.window.showQuickPick(
      [
        {
          label: 'Files',
          description: 'Workspace files matching glob pattern',
          role: 'files' as PaneRole,
        },
        {
          label: 'Directories',
          description: 'Workspace directory hierarchy or flat paths',
          role: 'directories' as PaneRole,
        },
        {
          label: 'Types',
          description: 'Classes, Interfaces, Enums, Structs',
          role: 'types' as PaneRole,
        },
        {
          label: 'Members',
          description: 'Methods, Fields, Properties, Constants',
          role: 'members' as PaneRole,
        },
        {
          label: 'Definitions',
          description: 'Go to Definition relation',
          role: 'definitions' as PaneRole,
        },
        {
          label: 'Declarations',
          description: 'Go to Declaration relation',
          role: 'declarations' as PaneRole,
        },
        {
          label: 'Implementations',
          description: 'Implementations of selected symbol',
          role: 'implementations' as PaneRole,
        },
        {
          label: 'References',
          description: 'Workspace references to selected symbol',
          role: 'references' as PaneRole,
        },
        {
          label: 'Problems',
          description: 'Workspace diagnostics and errors',
          role: 'problems' as PaneRole,
        },
        {
          label: 'Changes',
          description: 'Dirty and modified files',
          role: 'changes' as PaneRole,
        },
        {
          label: 'Callers',
          description: 'Incoming calls to selected symbol',
          role: 'callers' as PaneRole,
        },
        {
          label: 'Hierarchy',
          description: 'Type hierarchy (subtypes/supertypes)',
          role: 'hierarchy' as PaneRole,
        },
      ],
      { placeHolder: placeholder },
    );
  }

  private getRoleLabel(role: PaneRole): string {
    switch (role) {
      case 'files':
        return 'Files';
      case 'directories':
        return 'Directories';
      case 'types':
        return 'Types';
      case 'members':
        return 'Members';
      case 'definitions':
        return 'Definitions';
      case 'declarations':
        return 'Declarations';
      case 'implementations':
        return 'Implementations';
      case 'references':
        return 'References';
      case 'problems':
        return 'Problems';
      case 'changes':
        return 'Changes';
      case 'callers':
        return 'Callers';
      case 'hierarchy':
        return 'Hierarchy';
    }
  }

  private getInputLabel(input: PaneInputSource): string {
    switch (input) {
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

  private getFiltersSummary(pane: PaneConfig & { filters?: Record<string, boolean | undefined> }): string {
    if (!pane.filters) {
      return 'All active';
    }
    const active = ALL_SYMBOL_FILTER_OPTIONS.filter((o) => pane.filters![o.key] !== false);
    return `${active.length}/${ALL_SYMBOL_FILTER_OPTIONS.length} active`;
  }
}
