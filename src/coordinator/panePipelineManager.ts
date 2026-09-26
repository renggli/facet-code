import * as vscode from 'vscode';
import {
  PaneConfig,
  PaneRole,
  PaneInputSource,
  DisplayMode,
  PaneFilters,
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

    const newPane: PaneConfig = {
      id: '',
      title: rolePick.label,
      role: rolePick.role,
      inputSource: idx === 0 ? 'project' : 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
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

    const newPane: PaneConfig = {
      id: '',
      title: rolePick.label,
      role: rolePick.role,
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
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
        label: `${pane.followSelection ? '$(check)' : '   '} Follow Selection`,
        action: 'followSelection'
      },
      {
        label: `${pane.followCursor ? '$(check)' : '   '} Follow Cursor`,
        action: 'followCursor'
      },
      {
        label: `${pane.showIcons ? '$(check)' : '   '} Show Icons`,
        action: 'showIcons'
      },
      {
        label: `${pane.showContext ? '$(check)' : '   '} Show Context`,
        action: 'showContext'
      },
      {
        label: '$(filter) Filters...',
        description: this.getFiltersSummary(pane),
        action: 'filters'
      },
      {
        label: '$(list-tree) Display',
        description: pane.display === 'hierarchy' ? 'Hierarchy' : 'Flat',
        action: 'display'
      },
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
    ];

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
        const inputPick = await vscode.window.showQuickPick(
          [
            {
              label: 'Project',
              description: 'Global workspace symbols (default for first pane)',
              source: 'project' as PaneInputSource
            },
            {
              label: 'Cursor',
              description: 'Symbol at editor cursor position',
              source: 'cursor' as PaneInputSource
            },
            {
              label: 'Previous Pane',
              description: 'Symbols output from previous visible pane (default for later panes)',
              source: 'previous' as PaneInputSource
            },
            {
              label: 'File',
              description: 'Symbols in current active file',
              source: 'file' as PaneInputSource
            }
          ],
          { placeHolder: 'Select Input Source' }
        );
        if (inputPick) {
          pane.inputSource = inputPick.source;
          this._onDidUpdatePanes.fire();
          await this.coordinator.sync();
        }
        break;
      }
      case 'followSelection': {
        pane.followSelection = !pane.followSelection;
        this._onDidUpdatePanes.fire();
        this.coordinator.refreshSlot(pane.id);
        break;
      }
      case 'followCursor': {
        pane.followCursor = !pane.followCursor;
        this._onDidUpdatePanes.fire();
        break;
      }
      case 'showIcons': {
        pane.showIcons = !pane.showIcons;
        this._onDidUpdatePanes.fire();
        this.coordinator.refreshSlot(pane.id);
        break;
      }
      case 'showContext': {
        pane.showContext = !pane.showContext;
        this._onDidUpdatePanes.fire();
        this.coordinator.refreshSlot(pane.id);
        break;
      }
      case 'filters': {
        await this.configureFilters(pane);
        break;
      }
      case 'display': {
        const dispPick = await vscode.window.showQuickPick(
          [
            { label: 'Flat', description: 'Alphabetical selector list', mode: 'flat' as DisplayMode },
            {
              label: 'Hierarchy',
              description: 'Structured nested tree / inheritance',
              mode: 'hierarchy' as DisplayMode
            }
          ],
          { placeHolder: 'Select Display Mode' }
        );
        if (dispPick) {
          pane.display = dispPick.mode;
          this._onDidUpdatePanes.fire();
          await this.coordinator.sync();
        }
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

  private async configureFilters(pane: PaneConfig): Promise<void> {
    const isTypes = pane.role === 'types';
    const filterOptions: { label: string; key: keyof PaneFilters; picked: boolean }[] = isTypes
      ? [
          { label: 'Classes', key: 'classes', picked: pane.filters.classes !== false },
          { label: 'Interfaces', key: 'interfaces', picked: pane.filters.interfaces !== false },
          { label: 'Enums', key: 'enums', picked: pane.filters.enums !== false },
          { label: 'Structs', key: 'structs', picked: pane.filters.structs !== false },
          { label: 'Functions', key: 'functions', picked: pane.filters.functions !== false }
        ]
      : [
          { label: 'Methods', key: 'methods', picked: pane.filters.methods !== false },
          { label: 'Constructors', key: 'constructors', picked: pane.filters.constructors !== false },
          { label: 'Fields', key: 'fields', picked: pane.filters.fields !== false },
          {
            label: 'Properties & Accessors',
            key: 'properties',
            picked: pane.filters.properties !== false
          },
          { label: 'Variables', key: 'variables', picked: pane.filters.variables !== false },
          { label: 'Constants', key: 'constants', picked: pane.filters.constants !== false }
        ];

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
              description: 'Project Types (Global) -> Members -> References',
              preset: 'project'
            },
            {
              label: 'Implementations Browser',
              description: 'Project Types (Global) -> Members -> Implementations',
              preset: 'implementations'
            },
            {
              label: 'Callers Browser',
              description: 'Project Types (Global) -> Members -> Callers',
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
        p1.title = 'Project Types';
        p1.role = 'types';
        p1.inputSource = 'project';
        p1.display = 'flat';
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'previous';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'References';
        p3.role = 'references';
        p3.inputSource = 'previous';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'implementations': {
        const p1 = this.panes[0];
        p1.title = 'Project Types';
        p1.role = 'types';
        p1.inputSource = 'project';
        p1.display = 'flat';
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'previous';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'Implementations';
        p3.role = 'implementations';
        p3.inputSource = 'previous';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'callers': {
        const p1 = this.panes[0];
        p1.title = 'Project Types';
        p1.role = 'types';
        p1.inputSource = 'project';
        p1.display = 'flat';
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'previous';
        p2.display = 'flat';
        p2.visible = true;

        const p3 = this.panes[2];
        p3.title = 'Callers';
        p3.role = 'callers';
        p3.inputSource = 'previous';
        p3.display = 'flat';
        p3.visible = true;
        break;
      }

      case 'outline': {
        const p1 = this.panes[0];
        p1.title = 'Types';
        p1.role = 'types';
        p1.inputSource = 'file';
        p1.display = 'flat';
        p1.visible = true;

        const p2 = this.panes[1];
        p2.title = 'Members';
        p2.role = 'members';
        p2.inputSource = 'previous';
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
        return 'Project (Global)';
      case 'cursor':
        return 'Cursor (Editor Caret)';
      case 'previous':
        return 'Previous Pane';
      case 'file':
        return 'File (Active Editor)';
    }
  }

  private getFiltersSummary(pane: PaneConfig): string {
    const isTypes = pane.role === 'types';
    const keys = isTypes
      ? (['classes', 'interfaces', 'enums', 'structs', 'functions'] as const)
      : (['methods', 'constructors', 'fields', 'properties', 'variables', 'constants'] as const);

    const active = keys.filter((k) => pane.filters[k] !== false);
    return `${active.length}/${keys.length} active`;
  }
}
