import * as vscode from 'vscode';
import { PaneConfig, PaneRole, createDefaultPanes } from '../models/paneConfig';
import { FacetCoordinator } from './facetCoordinator';
import { TypesScope } from '../providers/typesTreeProvider';
import { ClassSide, MemberCategory, LayoutMode } from '../models/symbolNode';
import { RelationsMode } from '../providers/relationsTreeProvider';

export class PanePipelineManager {
  private panes: PaneConfig[];

  constructor(
    private readonly coordinator: FacetCoordinator,
    initialPanes?: PaneConfig[]
  ) {
    this.panes = initialPanes || createDefaultPanes();
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

  public async addPane(): Promise<PaneConfig | undefined> {
    const nextSlot = this.panes.find((p) => !p.visible);
    if (!nextSlot) {
      void vscode.window.showInformationMessage('Maximum number of native panes (6) reached.');
      return undefined;
    }

    const pickedRole = await vscode.window.showQuickPick(
      [
        { label: 'Types', description: 'Classes, Interfaces, Enums', role: 'types' as PaneRole },
        { label: 'Categories', description: 'Member kinds (Constructors, Fields, Methods, Static)', role: 'categories' as PaneRole },
        { label: 'Members', description: 'Selectors and Properties', role: 'members' as PaneRole },
        { label: 'Relations', description: 'Usages across workspace (References, Callers, Implementations)', role: 'relations' as PaneRole }
      ],
      { placeHolder: 'Select Role for New Pane' }
    );

    if (!pickedRole) {
      return undefined;
    }

    nextSlot.role = pickedRole.role;
    nextSlot.title = pickedRole.label;
    nextSlot.visible = true;

    this.syncContextKeys();
    await this.coordinator.sync();
    return nextSlot;
  }

  public removePane(slotId: string): boolean {
    const pane = this.getPane(slotId);
    if (!pane) {
      return false;
    }

    // Keep at least one pane visible
    if (this.getVisiblePanes().length <= 1) {
      void vscode.window.showWarningMessage('At least one pane must remain visible.');
      return false;
    }

    pane.visible = false;
    this.syncContextKeys();
    return true;
  }

  public movePane(slotId: string, direction: 'up' | 'down'): boolean {
    const visiblePanes = this.getVisiblePanes();
    const idx = visiblePanes.findIndex((p) => p.id === slotId);
    if (idx === -1) {
      return false;
    }

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= visiblePanes.length) {
      return false;
    }

    // Swap configurations between the two visible slots
    const current = visiblePanes[idx];
    const target = visiblePanes[targetIdx];

    const tempRole = current.role;
    const tempTitle = current.title;
    const tempScope = current.scope;
    const tempSide = current.side;
    const tempCategory = current.category;
    const tempLayout = current.layout;
    const tempRelMode = current.relationsMode;

    current.role = target.role;
    current.title = target.title;
    current.scope = target.scope;
    current.side = target.side;
    current.category = target.category;
    current.layout = target.layout;
    current.relationsMode = target.relationsMode;

    target.role = tempRole;
    target.title = tempTitle;
    target.scope = tempScope;
    target.side = tempSide;
    target.category = tempCategory;
    target.layout = tempLayout;
    target.relationsMode = tempRelMode;

    void this.coordinator.sync();
    return true;
  }

  public async configurePane(slotId: string): Promise<void> {
    const pane = this.getPane(slotId);
    if (!pane) {
      return;
    }

    const items: vscode.QuickPickItem[] = [
      {
        label: '$(symbol-class) Change Role',
        description: `Current: ${pane.role}`
      }
    ];

    if (pane.role === 'types') {
      items.push(
        {
          label: '$(globe) Toggle Scope (File / Project)',
          description: `Current: ${pane.scope}`
        },
        {
          label: '$(type-hierarchy) Toggle Hierarchy (Flat / Inherited)',
          description: 'Switch direct vs. inherited types'
        }
      );
    } else if (pane.role === 'members') {
      items.push(
        {
          label: '$(arrow-swap) Toggle Side (Instance / Class / Both)',
          description: `Current: ${pane.side}`
        },
        {
          label: '$(list-tree) Toggle Layout (List / Tree)',
          description: `Current: ${pane.layout}`
        }
      );
    } else if (pane.role === 'relations') {
      items.push({
        label: '$(settings) Switch Mode (References / Callers / Implementations)',
        description: `Current: ${pane.relationsMode}`
      });
    }

    items.push({
      label: '$(edit) Rename Pane',
      description: pane.title
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Configure Pane: ${pane.title}`
    });

    if (!picked) {
      return;
    }

    if (picked.label.includes('Change Role')) {
      const rolePick = await vscode.window.showQuickPick(
        [
          { label: 'Types', role: 'types' as PaneRole },
          { label: 'Categories', role: 'categories' as PaneRole },
          { label: 'Members', role: 'members' as PaneRole },
          { label: 'Relations', role: 'relations' as PaneRole }
        ],
        { placeHolder: 'Select new role' }
      );
      if (rolePick) {
        pane.role = rolePick.role;
        pane.title = rolePick.label;
        await this.coordinator.sync();
      }
    } else if (picked.label.includes('Toggle Scope')) {
      pane.scope = pane.scope === 'file' ? 'project' : 'file';
      this.coordinator.scope = pane.scope;
      await this.coordinator.sync();
    } else if (picked.label.includes('Toggle Hierarchy')) {
      this.coordinator.toggleHierarchy();
    } else if (picked.label.includes('Toggle Side')) {
      const nextSide: Record<ClassSide, ClassSide> = {
        instance: 'class',
        class: 'both',
        both: 'instance'
      };
      pane.side = nextSide[pane.side];
      this.coordinator.classSide = pane.side;
      this.coordinator.membersProvider.setClassSide(pane.side);
    } else if (picked.label.includes('Toggle Layout')) {
      pane.layout = pane.layout === 'list' ? 'tree' : 'list';
      this.coordinator.membersProvider.setLayoutMode(pane.layout);
    } else if (picked.label.includes('Switch Mode')) {
      const modePick = await vscode.window.showQuickPick(
        [
          { label: 'References', mode: 'references' as RelationsMode },
          { label: 'Callers (Senders)', mode: 'callers' as RelationsMode },
          { label: 'Implementations', mode: 'implementations' as RelationsMode }
        ],
        { placeHolder: 'Select Relations Mode' }
      );
      if (modePick) {
        pane.relationsMode = modePick.mode;
        this.coordinator.setRelationsMode(modePick.mode);
      }
    } else if (picked.label.includes('Rename Pane')) {
      const newTitle = await vscode.window.showInputBox({
        value: pane.title,
        prompt: 'Enter new pane title'
      });
      if (newTitle) {
        pane.title = newTitle;
      }
    }
  }

  public async applyPreset(presetName?: string): Promise<void> {
    const selected =
      presetName ||
      (
        await vscode.window.showQuickPick(
          [
            { label: 'Smalltalk System Browser', description: 'Types -> Categories -> Members -> Relations', preset: 'smalltalk' },
            { label: 'Implementors Browser', description: 'Project Types -> Members -> Implementations', preset: 'implementors' },
            { label: 'Senders (Callers) Browser', description: 'Members -> Callers (Senders)', preset: 'senders' },
            { label: 'Compact Outline', description: 'Types -> Members', preset: 'outline' }
          ],
          { placeHolder: 'Select Pane Pipeline Preset' }
        )
      )?.preset;

    if (!selected) {
      return;
    }

    // Reset visibility
    for (const p of this.panes) {
      p.visible = false;
    }

    switch (selected) {
      case 'implementors':
        this.panes[0].visible = true;
        this.panes[0].role = 'types';
        this.panes[0].scope = 'project';
        this.panes[0].title = 'Project Types';

        this.panes[1].visible = true;
        this.panes[1].role = 'members';
        this.panes[1].title = 'Members';

        this.panes[2].visible = true;
        this.panes[2].role = 'relations';
        this.panes[2].relationsMode = 'implementations';
        this.panes[2].title = 'Implementations';
        break;

      case 'senders':
        this.panes[0].visible = true;
        this.panes[0].role = 'members';
        this.panes[0].title = 'Members';

        this.panes[1].visible = true;
        this.panes[1].role = 'relations';
        this.panes[1].relationsMode = 'callers';
        this.panes[1].title = 'Senders (Callers)';
        break;

      case 'outline':
        this.panes[0].visible = true;
        this.panes[0].role = 'types';
        this.panes[0].scope = 'file';
        this.panes[0].title = 'Types';

        this.panes[1].visible = true;
        this.panes[1].role = 'members';
        this.panes[1].title = 'Members';
        break;

      default:
        // smalltalk preset
        this.panes[0].visible = true;
        this.panes[0].role = 'types';
        this.panes[0].scope = 'file';
        this.panes[0].title = 'Types';

        this.panes[1].visible = true;
        this.panes[1].role = 'categories';
        this.panes[1].title = 'Categories';

        this.panes[2].visible = true;
        this.panes[2].role = 'members';
        this.panes[2].side = 'instance';
        this.panes[2].title = 'Members';

        this.panes[3].visible = true;
        this.panes[3].role = 'relations';
        this.panes[3].relationsMode = 'references';
        this.panes[3].title = 'Relations';
        break;
    }

    this.syncContextKeys();
    await this.coordinator.sync();
  }
}
