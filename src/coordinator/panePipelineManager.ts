import * as vscode from 'vscode';
import {
  PaneConfig,
  PaneRole,
  PaneInputSource,
  SelectionSource,
  SortOption,
  DisplayMode,
  PaneFilters,
  ALL_SYMBOL_FILTER_OPTIONS,
  SymbolKindKey,
  createDefaultFilters,
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

  private reassignSlotIds(): void {
    const visible = this.getVisiblePanes();
    const hidden = this.panes.filter((p) => !p.visible);
    const combined = [...visible, ...hidden];

    for (let i = 0; i < combined.length; i++) {
      combined[i].id = `facet.pane.${i + 1}`;
    }
    this.panes = combined;
    this.syncContextKeys();
    this._onDidUpdatePanes.fire();
  }

  public async addPaneBefore(slotId: string): Promise<PaneConfig | undefined> {
    const visible = this.getVisiblePanes();
    if (visible.length >= 6) {
      void vscode.window.showWarningMessage?.('Maximum number of native panes (6) reached.');
      return undefined;
    }

    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx === -1) {
      return undefined;
    }

    const rolePick = await this.promptRolePicker('Select Role for Previous Pane');
    if (!rolePick) {
      return undefined;
    }

    const isTypesOrHierarchy = rolePick.role === 'types' || rolePick.role === 'hierarchy';
    const newPane: PaneConfig = {
      id: '',
      title: rolePick.label,
      role: rolePick.role,
      inputSource: idx === 0 ? 'global' : 'pane',
      selectionSource: idx === 0 ? 'cursor' : 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: isTypesOrHierarchy ? 'hierarchy' : 'flat',
      subclassTypes: isTypesOrHierarchy ? ['class', 'struct'] : undefined,
      visible: true
    };

    visible.splice(idx, 0, newPane);

    const hidden = this.panes.filter((p) => !p.visible);
    hidden.pop(); // Remove one hidden slot to maintain total 6 slots

    this.panes = [...visible, ...hidden];
    this.reassignSlotIds();
    await this.coordinator.sync();

    return newPane;
  }

  public async addPaneAfter(slotId: string): Promise<PaneConfig | undefined> {
    const visible = this.getVisiblePanes();
    if (visible.length >= 6) {
      void vscode.window.showWarningMessage?.('Maximum number of native panes (6) reached.');
      return undefined;
    }

    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx === -1) {
      return undefined;
    }

    const rolePick = await this.promptRolePicker('Select Role for Next Pane');
    if (!rolePick) {
      return undefined;
    }

    const isTypesOrHierarchy = rolePick.role === 'types' || rolePick.role === 'hierarchy';
    const newPane: PaneConfig = {
      id: '',
      title: rolePick.label,
      role: rolePick.role,
      inputSource: 'pane',
      selectionSource: 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: isTypesOrHierarchy ? 'hierarchy' : 'flat',
      subclassTypes: isTypesOrHierarchy ? ['class', 'struct'] : undefined,
      visible: true
    };

    visible.splice(idx + 1, 0, newPane);

    const hidden = this.panes.filter((p) => !p.visible);
    hidden.pop();

    this.panes = [...visible, ...hidden];
    this.reassignSlotIds();
    await this.coordinator.sync();

    return newPane;
  }

  public removePane(slotId: string): boolean {
    const visible = this.getVisiblePanes();
    if (visible.length <= 1) {
      void vscode.window.showWarningMessage?.('At least one pane must remain in the pipeline.');
      return false;
    }

    const idx = visible.findIndex((p) => p.id === slotId);
    if (idx === -1) {
      return false;
    }

    const [removed] = visible.splice(idx, 1);
    removed.visible = false;

    const hidden = this.panes.filter((p) => !p.visible);
    this.panes = [...visible, ...hidden, removed];
    this.reassignSlotIds();
    void this.coordinator.sync();

    return true;
  }

  public async configurePane(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }

    const visible = this.getVisiblePanes();
    const paneIndex = visible.findIndex((p) => p.id === slotId);
    const isFirstPane = paneIndex === 0;
    const supportsHierarchy = pane.role === 'types' || pane.role === 'hierarchy';

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
      },
      {
        label: '$(filter) Filters...',
        description: this.getFiltersSummary(pane),
        action: 'filters'
      }
    ];

    if (pane.role === 'files') {
      items.push({
        label: '$(regex) Regexp Filter...',
        description: pane.filePattern ? `/${pane.filePattern}/` : 'None',
        action: 'filePattern'
      });
    }

    if (supportsHierarchy) {
      items.push({
        label: '$(list-tree) Display...',
        description: pane.display === 'hierarchy' ? 'Hierarchy' : 'Flat',
        action: 'display'
      });
    }

    items.push(
      { label: 'Pipeline Settings', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(add) Add Previous Pane',
        description: 'Insert a new pane before this one',
        action: 'addPrevious'
      },
      {
        label: '$(add) Add Next Pane',
        description: 'Insert a new pane after this one',
        action: 'addNext'
      },
      {
        label: '$(trash) Remove Pane',
        description: 'Remove this pane from the pipeline',
        action: 'remove'
      },
      { label: 'Presets', kind: vscode.QuickPickItemKind.Separator },
      {
        label: '$(layers) Apply Preset...',
        description: 'Project Browser, Implementations, Callers, Outline',
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
          pane.role = rolePick.role;
          pane.title = rolePick.label;
          this._onDidUpdatePanes.fire();
          await this.coordinator.sync();
        }
        break;
      }
      case 'input': {
        const inputOptions: { label: string; description: string; source: PaneInputSource }[] = [
          {
            label: 'Global',
            description: 'Workspace-wide symbols',
            source: 'global'
          },
          {
            label: 'File',
            description: 'Symbols in active editor document',
            source: 'file'
          }
        ];
        if (!isFirstPane) {
          inputOptions.push({
            label: 'Pane',
            description: 'Symbols from previous visible pane',
            source: 'pane'
          });
        }
        const inputPick = await vscode.window.showQuickPick(inputOptions, {
          placeHolder: 'Select Input Source'
        });
        if (inputPick) {
          pane.inputSource = inputPick.source;
          this._onDidUpdatePanes.fire();
          await this.coordinator.sync();
        }
        break;
      }
      case 'selectionSource': {
        const selPick = await vscode.window.showQuickPick(
          [
            {
              label: 'Cursor',
              description: 'Symbol at editor cursor (selects all previous panes)',
              source: 'cursor' as SelectionSource
            },
            {
              label: 'All',
              description: 'Select all symbols in this pane',
              source: 'all' as SelectionSource
            },
            {
              label: 'None',
              description: 'No automatic selection synchronization',
              source: 'none' as SelectionSource
            }
          ],
          { placeHolder: 'Select Selection Source' }
        );
        if (selPick) {
          pane.selectionSource = selPick.source;
          this._onDidUpdatePanes.fire();
          this.coordinator.handlePaneSelectionSourceChange(pane.id);
        }
        break;
      }
      case 'sort': {
        const sortPick = await vscode.window.showQuickPick(
          [
            {
              label: 'Alphabetical',
              description: 'Sort symbols alphabetically by name',
              sort: 'alphabetical' as SortOption
            },
            {
              label: 'File Order',
              description: 'Sort symbols by appearance in source file',
              sort: 'fileOrder' as SortOption
            },
            {
              label: 'Grouped',
              description: 'Group symbols by kind/category (e.g. classes, methods, fields)',
              sort: 'grouped' as SortOption
            }
          ],
          { placeHolder: 'Select Sort Order' }
        );
        if (sortPick) {
          pane.sort = sortPick.sort;
          this._onDidUpdatePanes.fire();
          this.coordinator.refreshSlot(pane.id);
        }
        break;
      }
      case 'filters': {
        await this.configureFilters(pane);
        break;
      }
      case 'filePattern': {
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
        break;
      }
      case 'display': {
        await this.configureDisplay(pane);
        break;
      }
      case 'addPrevious': {
        await this.addPaneBefore(slotId);
        break;
      }
      case 'addNext': {
        await this.addPaneAfter(slotId);
        break;
      }
      case 'remove': {
        this.removePane(slotId);
        break;
      }
      case 'preset': {
        await this.applyPreset();
        break;
      }
    }
  }

  private async configureDisplay(pane: PaneConfig): Promise<void> {
    const dispPick = await vscode.window.showQuickPick(
      [
        {
          label: 'Hierarchy',
          description: 'Tree hierarchy of subclasses and subtypes',
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
    if (!dispPick) {
      return;
    }

    pane.display = dispPick.mode;

    if (pane.display === 'hierarchy') {
      const subclassOptions: { label: string; key: SymbolKindKey; picked: boolean }[] = [
        { label: 'Class', key: 'class', picked: (pane.subclassTypes || ['class', 'struct']).includes('class') },
        { label: 'Interface', key: 'interface', picked: (pane.subclassTypes || ['class', 'struct']).includes('interface') },
        { label: 'Struct', key: 'struct', picked: (pane.subclassTypes || ['class', 'struct']).includes('struct') },
        { label: 'Enum', key: 'enum', picked: (pane.subclassTypes || ['class', 'struct']).includes('enum') }
      ];

      const selectedSubclasses = await vscode.window.showQuickPick(subclassOptions, {
        canPickMany: true,
        placeHolder: 'Select what types to show as subclasses'
      });

      if (selectedSubclasses) {
        pane.subclassTypes = selectedSubclasses.map((s) => s.key);
      }
    }

    this._onDidUpdatePanes.fire();
    await this.coordinator.sync();
  }

  private async configureFilters(pane: PaneConfig): Promise<void> {
    const filterOptions = ALL_SYMBOL_FILTER_OPTIONS.map((opt) => ({
      label: opt.label,
      key: opt.key,
      picked: pane.filters[opt.key] !== false
    }));

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
              description: 'Types (Global) -> Members -> References',
              preset: 'project'
            },
            {
              label: 'Implementations Browser',
              description: 'Types (Global) -> Members -> Implementations',
              preset: 'implementations'
            },
            {
              label: 'Callers Browser',
              description: 'Types (Global) -> Members -> Callers',
              preset: 'callers'
            },
            {
              label: 'Compact Outline',
              description: 'Active File Types -> Members',
              preset: 'outline'
            }
          ],
          { placeHolder: 'Select Pane Pipeline Preset' }
        )
      )?.preset;

    if (!selected) {
      return;
    }

    for (const p of this.panes) {
      p.visible = false;
    }

    switch (selected) {
      case 'project':
      default: {
        const p1 = this.panes[0];
        p1.title = 'Types';
        p1.role = 'types';
        p1.inputSource = 'global';
        p1.selectionSource = 'cursor';
        p1.display = 'hierarchy';
        p1.subclassTypes = ['class', 'struct'];
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'pane';
        p2.selectionSource = 'none';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'References';
        p3.role = 'references';
        p3.inputSource = 'pane';
        p3.selectionSource = 'none';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'implementations': {
        const p1 = this.panes[0];
        p1.title = 'Types';
        p1.role = 'types';
        p1.inputSource = 'global';
        p1.selectionSource = 'cursor';
        p1.display = 'hierarchy';
        p1.subclassTypes = ['class', 'struct'];
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'pane';
        p2.selectionSource = 'none';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'Implementations';
        p3.role = 'implementations';
        p3.inputSource = 'pane';
        p3.selectionSource = 'none';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'callers': {
        const p1 = this.panes[0];
        p1.title = 'Types';
        p1.role = 'types';
        p1.inputSource = 'global';
        p1.selectionSource = 'cursor';
        p1.display = 'hierarchy';
        p1.subclassTypes = ['class', 'struct'];
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'pane';
        p2.selectionSource = 'none';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'Callers';
        p3.role = 'callers';
        p3.inputSource = 'pane';
        p3.selectionSource = 'none';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'outline': {
        const p1 = this.panes[0];
        p1.title = 'Types';
        p1.role = 'types';
        p1.inputSource = 'file';
        p1.selectionSource = 'cursor';
        p1.display = 'hierarchy';
        p1.subclassTypes = ['class', 'struct'];
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'pane';
        p2.selectionSource = 'none';
        p2.display = 'flat';
        p2.visible = true;
        break;
      }
    }

    this.reassignSlotIds();
    await this.coordinator.sync();
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
      case 'global':
        return 'Global';
      case 'file':
        return 'File';
      case 'pane':
        return 'Pane';
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
      case 'alphabetical':
        return 'Alphabetical';
      case 'fileOrder':
        return 'File Order';
      case 'grouped':
        return 'Grouped';
    }
  }

  private getFiltersSummary(pane: PaneConfig): string {
    const active = ALL_SYMBOL_FILTER_OPTIONS.filter((opt) => pane.filters[opt.key] !== false);
    return `${active.length}/${ALL_SYMBOL_FILTER_OPTIONS.length} active`;
  }
}
