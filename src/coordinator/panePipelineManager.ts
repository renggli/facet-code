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
    for (const pane of this.panes) {
      void vscode.commands.executeCommand('setContext', `${pane.id}.visible`, pane.visible);
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

  public async configurePane(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }

    const visible = this.getVisiblePanes();
    const idx = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = idx === 0;

    const items: (vscode.QuickPickItem & { action?: string })[] = [
      { label: 'General Settings', kind: vscode.QuickPickItemKind.Separator },
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

    if (pane.role === 'files') {
      items.push({
        label: '$(regex) Regexp Filter...',
        description: pane.filePattern ? `/${pane.filePattern}/` : 'None',
        action: 'filePattern'
      });
    }

    if (pane.role === 'types' || pane.role === 'members' || pane.role === 'hierarchy') {
      if (pane.role === 'types' || pane.role === 'hierarchy') {
        items.push({
          label: '$(list-tree) Display Mode...',
          description: pane.display === 'hierarchy' ? 'Hierarchy' : 'Flat',
          action: 'display'
        });
        if (pane.display === 'hierarchy') {
          items.push({
            label: '$(type-hierarchy-sub) Subclass Kinds...',
            description: (pane.subclassTypes || ['class', 'struct']).join(', '),
            action: 'subclassTypes'
          });
        }
      }
      items.push({
        label: '$(filter) Filters...',
        description: this.getFiltersSummary(pane),
        action: 'filters'
      });
    }

    items.push({ label: 'Pipeline Settings', kind: vscode.QuickPickItemKind.Separator });

    if (visible.length < 6) {
      items.push({
        label: '$(add) Add Pane to End',
        description: 'Append a new pane to the end of the pipeline',
        action: 'addEnd'
      });
    }
    if (visible.length > 1) {
      items.push({
        label: '$(trash) Remove Pane',
        description: 'Remove this pane from the pipeline',
        action: 'remove'
      });
    }

    items.push(
      { label: 'Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(layers) Apply Preset...',
        description: 'Project Browser, Implementations, Callers, Compact Outline, File Browser',
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
        if (pane.role === 'files' || pane.role === 'types' || pane.role === 'hierarchy') {
          inputOptions.push({
            label: 'Project',
            description: 'Workspace-wide files or symbols',
            source: 'project'
          });
        }
        if (pane.role === 'files' || pane.role === 'types' || pane.role === 'members' || pane.role === 'hierarchy') {
          inputOptions.push({
            label: 'Open Editors',
            description: 'Symbols or files from open editor tabs',
            source: 'openEditors'
          });
          inputOptions.push({
            label: 'Active Editor',
            description: 'Symbols or file from the active editor',
            source: 'activeEditor'
          });
        }
        if (!isFirstPane) {
          inputOptions.push({
            label: 'Previous Pane',
            description: 'Symbols from preceding visible pane',
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
        if (pane.role !== 'references' && pane.role !== 'implementations' && pane.role !== 'callers') {
          options.push({
            label: 'Cursor',
            description: 'Active cursor symbol (selects enclosing items across previous panes)',
            source: 'cursor'
          });
        }
        options.push(
          {
            label: 'All',
            description: 'Select all items in this pane',
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
            description: 'Sort by position in file',
            sort: 'position'
          }
        ];
        if (pane.role === 'types' || pane.role === 'members' || pane.role === 'hierarchy') {
          sortOptions.push({
            label: 'Category',
            description: 'Group symbols by kind/category',
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
      case 'filePattern': {
        if (pane.role === 'files') {
          const pattern = await vscode.window.showInputBox({
            value: pane.filePattern || '',
            prompt: 'Enter regular expression filter for files (e.g. .*\\.ts$ or test)',
            placeHolder: 'e.g. .*\\.ts$'
          });
          if (pattern !== undefined) {
            pane.filePattern = pattern.trim() || undefined;
            this._onDidUpdatePanes.fire();
            this.coordinator.refreshSlot(pane.id);
          }
        }
        break;
      }
      case 'display': {
        if ('display' in pane) {
          const dispPick = await vscode.window.showQuickPick(
            [
              {
                label: 'Hierarchy',
                description: 'Tree hierarchy of subtypes and subclasses',
                mode: 'hierarchy' as DisplayMode
              },
              {
                label: 'Flat',
                description: 'Alphabetical list without nesting',
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

  private async configureFilters(pane: PaneConfig & { filters: Record<string, boolean | undefined> }): Promise<void> {
    const keys = pane.role === 'members' ? MEMBER_FILTER_KEYS : TYPE_FILTER_KEYS;
    const filterOptions = keys.map((key) => {
      const opt = ALL_SYMBOL_FILTER_OPTIONS.find((o) => o.key === key);
      return {
        label: opt ? opt.label : key,
        key,
        picked: pane.filters[key] !== false
      };
    });

    const selected = await vscode.window.showQuickPick(filterOptions, {
      canPickMany: true,
      placeHolder: 'Toggle filters (checked = visible)'
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
      presetName ||
      (
        await vscode.window.showQuickPick(
          [
            {
              label: 'Project Browser',
              description: 'Types (Project) -> Members -> References',
              preset: 'project'
            },
            {
              label: 'Implementations Browser',
              description: 'Types (Project) -> Members -> Implementations',
              preset: 'implementations'
            },
            {
              label: 'Callers Browser',
              description: 'Types (Project) -> Members -> Callers',
              preset: 'callers'
            },
            {
              label: 'Compact Outline',
              description: 'Active Editor Types -> Members',
              preset: 'outline'
            },
            {
              label: 'File Browser',
              description: 'Files (Project) -> Types -> Members',
              preset: 'fileBrowser'
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
          createTypesPane('', { title: 'Types', inputSource: 'project', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' }),
          createReferencesPane('', { title: 'References', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
      case 'implementations':
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
      case 'outline':
        newVisible = [
          createTypesPane('', { title: 'Types', inputSource: 'activeEditor', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' })
        ];
        break;
      case 'fileBrowser':
        newVisible = [
          createFilesPane('', { title: 'Files', inputSource: 'project', selectionSource: 'cursor' }),
          createTypesPane('', { title: 'Types', inputSource: 'previousPane', selectionSource: 'cursor' }),
          createMembersPane('', { title: 'Members', inputSource: 'previousPane', selectionSource: 'none' })
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
          description: 'Workspace files matching regexp pattern',
          role: 'files' as PaneRole
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
          label: 'References',
          description: 'Workspace references to selected symbol',
          role: 'references' as PaneRole
        },
        {
          label: 'Implementations',
          description: 'Implementations of selected symbol',
          role: 'implementations' as PaneRole
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
      case 'types':
        return 'Types';
      case 'members':
        return 'Members';
      case 'references':
        return 'References';
      case 'implementations':
        return 'Implementations';
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

  private getFiltersSummary(pane: PaneConfig & { filters: Record<string, boolean | undefined> }): string {
    const keys = pane.role === 'members' ? MEMBER_FILTER_KEYS : TYPE_FILTER_KEYS;
    const active = keys.filter((k) => pane.filters[k] !== false);
    return `${active.length}/${keys.length} active`;
  }
}
