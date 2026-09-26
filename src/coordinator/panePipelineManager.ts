import * as vscode from 'vscode';
import {
  PaneConfig,
  PaneRole,
  PaneInputSource,
  SelectionSource,
  SortOption,
  DisplayMode,
  SymbolKindKey,
  ALL_SYMBOL_FILTER_OPTIONS,
  TYPE_FILTER_KEYS,
  MEMBER_FILTER_KEYS,
  createPaneByRole,
  createTypesPane,
  createMembersPane,
  createReferencesPane,
  createImplementationsPane,
  createCallersPane,
  createFilesPane,
  createDirectoriesPane,
  createDefaultPanes
} from '../models/paneConfig';
import { FacetCoordinator } from './facetCoordinator';

export class PanePipelineManager {
  private panes: PaneConfig[];

  private _onDidUpdatePanes = new vscode.EventEmitter<void>();
  readonly onDidUpdatePanes = this._onDidUpdatePanes.event;

  constructor(
    private readonly coordinator: FacetCoordinator,
    initialPanes?: PaneConfig[]
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

  public syncContextKeys(): void {
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
      'hierarchy'
    ];
    const visibleRoles = new Set(this.getVisiblePanes().map((p) => p.role));

    for (const pane of this.panes) {
      void vscode.commands.executeCommand('setContext', `${pane.id}.visible`, pane.visible);
    }

    for (const role of allRoles) {
      void vscode.commands.executeCommand('setContext', `facet.role.${role}.visible`, visibleRoles.has(role));
    }
  }

  public async applyVisiblePanes(newVisible: PaneConfig[]): Promise<void> {
    const totalSlots = 6;
    const clampedVisible = newVisible.slice(0, totalSlots);

    const updatedPanes: PaneConfig[] = [];
    for (let i = 0; i < clampedVisible.length; i++) {
      const p = clampedVisible[i];
      p.id = `facet.pane.${i + 1}`;
      p.visible = true;

      // If the first visible pane was set to previousPane, default it to project/activeEditor
      if (i === 0 && p.inputSource === 'previousPane') {
        p.inputSource = (p.role === 'members' ? 'openEditors' : 'project') as any;
      }
      updatedPanes.push(p);
    }

    for (let i = clampedVisible.length; i < totalSlots; i++) {
      const slotId = `facet.pane.${i + 1}`;
      const hiddenPane = createMembersPane(slotId, { visible: false });
      updatedPanes.push(hiddenPane);
    }

    this.panes = updatedPanes;
    this.syncContextKeys();
    this.coordinator.clearSlotSelections();
    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
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
      visible: true
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
    const hiddenPanes = this.panes.filter((p) => !p.visible);

    if (newVisible.length > 0 && newVisible[0].inputSource === 'previousPane') {
      newVisible[0].inputSource = (newVisible[0].role === 'members' ? 'openEditors' : 'project') as any;
    }

    this.panes = [...newVisible, ...hiddenPanes];
    this.syncContextKeys();
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
        action: 'title'
      },
      {
        label: '$(symbol-class) Type of Pane',
        description: `Current: ${this.getRoleLabel(pane.role)}`,
        action: 'type'
      },
      {
        label: '$(sign-in) Input Source',
        description: `Current: ${this.getInputLabel(pane.inputSource)}`,
        action: 'input'
      },
      {
        label: '$(inspect) Selection Source',
        description: `Current: ${this.getSelectionSourceLabel(pane.selectionSource)}`,
        action: 'selectionSource'
      },
      {
        label: '$(sort-precedence) Sort',
        description: `Current: ${this.getSortLabel(pane.sort)}`,
        action: 'sort'
      }
    ];

    if (pane.role === 'files' || pane.role === 'directories') {
      const currentPat = ('globPattern' in pane && pane.globPattern) || ('filePattern' in pane && pane.filePattern);
      items.push({
        label: '$(filter) Filter (Glob Pattern)...',
        description: currentPat ? currentPat : 'None',
        action: 'globPattern'
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
        action: 'filters'
      });
    }

    if (
      pane.role === 'files' ||
      pane.role === 'directories' ||
      pane.role === 'types' ||
      pane.role === 'members' ||
      pane.role === 'hierarchy'
    ) {
      items.push({
        label: '$(list-tree) Display Mode...',
        description: ('display' in pane && pane.display === 'hierarchy') ? 'Hierarchy' : 'Flat',
        action: 'display'
      });
      if ('subclassTypes' in pane && pane.display === 'hierarchy') {
        items.push({
          label: '$(type-hierarchy-sub) Subclass Kinds...',
          description: (pane.subclassTypes || ['class', 'struct']).join(', '),
          action: 'subclassTypes'
        });
      }
    }

    if (pane.role === 'files') {
      items.push({
        label: '$(file-submodule) Directory Traversal...',
        description: ('recursive' in pane && (pane as any).recursive) ? 'Recursive' : 'Non-Recursive (Direct files only)',
        action: 'recursive'
      });
    }

    items.push({ label: 'Manage Panes', kind: vscode.QuickPickItemKind.Separator });

    if (visible.length < 6) {
      items.push({
        label: '$(add) Add Pane',
        description: 'Append a new pane',
        action: 'addEnd'
      });
    }
    if (visible.length > 1) {
      items.push({
        label: '$(trash) Remove Pane',
        description: 'Remove this pane',
        action: 'remove'
      });
    }

    items.push(
      { label: 'Pane Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(layers) Apply Preset...',
        description: 'Project Browser, Implementors, Callers, References',
        action: 'preset'
      }
    );

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Configure Pane: ${pane.title}`
    });

    if (!picked || !picked.action) {
      return;
    }

    switch (picked.action) {
      case 'title': {
        const newTitle = await vscode.window.showInputBox({
          value: pane.title,
          prompt: 'Enter new pane title'
        });
        if (newTitle) {
          pane.title = newTitle;
          this._onDidUpdatePanes.fire();
        }
        break;
      }
      case 'type': {
        const rolePick = await this.promptRolePicker('Select Pane Type');
        if (rolePick) {
          const newPane = createPaneByRole(rolePick.role, pane.id, {
            title: rolePick.label,
            inputSource: isFirstPane ? (rolePick.role === 'members' ? 'openEditors' : 'project') : pane.inputSource,
            visible: true
          });
          visible[idx] = newPane;
          await this.applyVisiblePanes(visible);
        }
        break;
      }
      case 'input': {
        const inputOptions: { label: string; description: string; source: PaneInputSource }[] = [];
        if (['files', 'directories', 'types', 'problems', 'changes'].includes(pane.role)) {
          inputOptions.push({
            label: 'Project',
            description: 'Workspace-wide files, directories, symbols, or issues',
            source: 'project'
          });
        }
        if (['files', 'directories', 'types', 'members', 'problems', 'changes'].includes(pane.role)) {
          inputOptions.push({
            label: 'Open Editors',
            description: 'Items from open editor tabs',
            source: 'openEditors'
          });
          inputOptions.push({
            label: 'Active Editor',
            description: 'Items from the active editor',
            source: 'activeEditor'
          });
        }
        if (!isFirstPane) {
          inputOptions.push({
            label: 'Previous Pane',
            description: 'Items from preceding visible pane',
            source: 'previousPane'
          });
        }
        const inputPick = await vscode.window.showQuickPick(inputOptions, {
          placeHolder: 'Select Input Source'
        });
        if (inputPick) {
          pane.inputSource = inputPick.source as any;
          this._onDidUpdatePanes.fire();
          await this.coordinator.sync();
        }
        break;
      }
      case 'selectionSource': {
        const options: { label: string; description: string; source: SelectionSource }[] = [];
        if (['files', 'directories', 'types', 'members', 'problems', 'changes'].includes(pane.role)) {
          options.push({
            label: 'Cursor',
            description: 'Active cursor symbol or file (selects item under cursor)',
            source: 'cursor'
          });
        }
        options.push(
          {
            label: 'All',
            description: 'Select all items in this pane by default',
            source: 'all'
          },
          {
            label: 'None',
            description: 'Manual selection only',
            source: 'none'
          }
        );
        const selPick = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select Selection Source'
        });
        if (selPick) {
          pane.selectionSource = selPick.source;
          this._onDidUpdatePanes.fire();
          this.coordinator.handlePaneSelectionSourceChange(pane.id);
        }
        break;
      }
      case 'sort': {
        const sortOptions: { label: string; description: string; sort: SortOption }[] = [
          {
            label: 'Name',
            description: 'Sort alphabetically by name',
            sort: 'name'
          },
          {
            label: 'Position',
            description: 'Sort by position in file or directory path',
            sort: 'position'
          }
        ];
        if (pane.role === 'types' || pane.role === 'members' || pane.role === 'hierarchy' || pane.role === 'problems') {
          sortOptions.push({
            label: 'Category',
            description: 'Group items by kind, category, or severity',
            sort: 'category'
          });
        }
        const sortPick = await vscode.window.showQuickPick(sortOptions, {
          placeHolder: 'Select Sort Order'
        });
        if (sortPick) {
          pane.sort = sortPick.sort as any;
          this._onDidUpdatePanes.fire();
          this.coordinator.refreshSlot(pane.id);
        }
        break;
      }
      case 'globPattern': {
        const currentVal = ('globPattern' in pane && pane.globPattern) || ('filePattern' in pane && pane.filePattern) || '';
        const pattern = await vscode.window.showInputBox({
          value: currentVal,
          prompt: 'Enter glob pattern on full path (e.g. src/**/*.ts, !*test*)',
          placeHolder: 'e.g. src/**/*.ts'
        });
        if (pattern !== undefined) {
          const trimmed = pattern.trim() || undefined;
          (pane as any).globPattern = trimmed;
          (pane as any).filePattern = trimmed;
          this._onDidUpdatePanes.fire();
          this.coordinator.refreshSlot(pane.id);
        }
        break;
      }
      case 'display': {
        if ('display' in pane) {
          const dispPick = await vscode.window.showQuickPick(
            [
              {
                label: 'Hierarchy',
                description: 'Tree hierarchy structure',
                mode: 'hierarchy' as DisplayMode
              },
              {
                label: 'Flat',
                description: 'Alphabetical or flat list without nesting',
                mode: 'flat' as DisplayMode
              }
            ],
            { placeHolder: 'Select Display Mode' }
          );
          if (dispPick) {
            pane.display = dispPick.mode;
            this._onDidUpdatePanes.fire();
            await this.coordinator.sync();
          }
        }
        break;
      }
      case 'subclassTypes': {
        if ('subclassTypes' in pane) {
          const current = pane.subclassTypes || ['class', 'struct'];
          const subclassOptions = [
            { label: 'Class', key: 'class' as SymbolKindKey, picked: current.includes('class') },
            { label: 'Interface', key: 'interface' as SymbolKindKey, picked: current.includes('interface') },
            { label: 'Struct', key: 'struct' as SymbolKindKey, picked: current.includes('struct') },
            { label: 'Enum', key: 'enum' as SymbolKindKey, picked: current.includes('enum') }
          ];
          const selected = await vscode.window.showQuickPick(subclassOptions, {
            canPickMany: true,
            placeHolder: 'Select what types to show as subclasses'
          });
          if (selected) {
            pane.subclassTypes = selected.map((s) => s.key);
            this._onDidUpdatePanes.fire();
            await this.coordinator.sync();
          }
        }
        break;
      }
      case 'filters': {
        if ('filters' in pane) {
          await this.configureFilters(pane);
        }
        break;
      }
      case 'recursive': {
        if (pane.role === 'files') {
          const recPick = await vscode.window.showQuickPick(
            [
              {
                label: 'Non-Recursive',
                description: 'Show only files directly in selected directory',
                recursive: false
              },
              {
                label: 'Recursive',
                description: 'Show files in selected directory and all subdirectories',
                recursive: true
              }
            ],
            { placeHolder: 'Select Directory Traversal Mode' }
          );
          if (recPick) {
            (pane as any).recursive = recPick.recursive;
            this._onDidUpdatePanes.fire();
            this.coordinator.refreshSlot(pane.id);
          }
        }
        break;
      }
      case 'addEnd': {
        await this.addPaneToEnd();
        break;
      }
      case 'remove': {
        await this.removePane(slotId);
        break;
      }
      case 'preset': {
        await this.applyPreset();
        break;
      }
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
        picked: pane.filters![opt.key] !== false
      };
    });

    const selected = await vscode.window.showQuickPick(filterOptions, {
      canPickMany: true,
      placeHolder: 'Toggle symbol filters across 26 kinds (checked = visible)'
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
    const selected =
      presetName?.toLowerCase() ||
      (
        await vscode.window.showQuickPick(
          [
            {
              label: 'Project Browser',
              description: 'Directories (Hierarchy) -> Files -> Types (Hierarchy) -> Members',
              preset: 'project'
            },
            {
              label: 'Implementors',
              description: 'Types -> Members -> Implementations',
              preset: 'implementors'
            },
            {
              label: 'Callers',
              description: 'Types -> Members -> Callers',
              preset: 'callers'
            },
            {
              label: 'References',
              description: 'Types -> Members -> References',
              preset: 'references'
            }
          ],
          { placeHolder: 'Select Pane Pipeline Preset' }
        )
      )?.preset;

    if (!selected) {
      return;
    }

    let newVisible: PaneConfig[];
    switch (selected) {
      case 'project':
      default:
        newVisible = [
          createDirectoriesPane('', { title: 'Directories', display: 'hierarchy', inputSource: 'project', selectionSource: 'cursor' }),
          createFilesPane('', { title: 'Files', display: 'flat', inputSource: 'previousPane', selectionSource: 'cursor' }),
          createTypesPane('', { title: 'Types', display: 'hierarchy', inputSource: 'previousPane', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', display: 'flat', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
      case 'implementors':
        newVisible = [
          createTypesPane('', { title: 'Types', inputSource: 'project', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' }),
          createImplementationsPane('', { title: 'Implementations', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
      case 'callers':
        newVisible = [
          createTypesPane('', { title: 'Types', inputSource: 'project', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' }),
          createCallersPane('', { title: 'Callers', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
      case 'references':
        newVisible = [
          createTypesPane('', { title: 'Types', inputSource: 'project', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' }),
          createReferencesPane('', { title: 'References', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
    }

    await this.applyVisiblePanes(newVisible);
  }

  private async promptRolePicker(
    placeholder: string
  ): Promise<{ label: string; role: PaneRole } | undefined> {
    return vscode.window.showQuickPick(
      [
        {
          label: 'Files',
          description: 'Workspace files matching glob pattern',
          role: 'files' as PaneRole
        },
        {
          label: 'Directories',
          description: 'Workspace directory hierarchy or flat paths',
          role: 'directories' as PaneRole
        },
        {
          label: 'Types',
          description: 'Classes, Interfaces, Enums, Structs',
          role: 'types' as PaneRole
        },
        {
          label: 'Members',
          description: 'Methods, Fields, Properties, Constants',
          role: 'members' as PaneRole
        },
        {
          label: 'Definitions',
          description: 'Go to Definition relation',
          role: 'definitions' as PaneRole
        },
        {
          label: 'Declarations',
          description: 'Go to Declaration relation',
          role: 'declarations' as PaneRole
        },
        {
          label: 'Implementations',
          description: 'Implementations of selected symbol',
          role: 'implementations' as PaneRole
        },
        {
          label: 'References',
          description: 'Workspace references to selected symbol',
          role: 'references' as PaneRole
        },
        {
          label: 'Problems',
          description: 'Workspace diagnostics and errors',
          role: 'problems' as PaneRole
        },
        {
          label: 'Changes',
          description: 'Dirty and modified files',
          role: 'changes' as PaneRole
        },
        {
          label: 'Callers',
          description: 'Incoming calls to selected symbol',
          role: 'callers' as PaneRole
        },
        {
          label: 'Hierarchy',
          description: 'Type hierarchy (subtypes/supertypes)',
          role: 'hierarchy' as PaneRole
        }
      ],
      { placeHolder: placeholder }
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
