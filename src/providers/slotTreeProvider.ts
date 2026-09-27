import * as vscode from 'vscode';
import type { FacetCoordinator, FacetSlotItem } from '../coordinator/facetCoordinator';
import type { PaneConfig } from '../models/paneConfig';

export class SlotTreeProvider implements vscode.TreeDataProvider<FacetSlotItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FacetSlotItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private explicitConfig?: PaneConfig;
  public readonly slotId: string;

  constructor(
    slotOrConfig: string | PaneConfig,
    private readonly coordinator: FacetCoordinator,
  ) {
    if (typeof slotOrConfig === 'string') {
      this.slotId = slotOrConfig;
    } else {
      this.explicitConfig = slotOrConfig;
      this.slotId = slotOrConfig.id;
    }
  }

  public get config(): PaneConfig | undefined {
    return this.explicitConfig ?? this.coordinator.getPipelineManager()?.getPane(this.slotId);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FacetSlotItem): vscode.TreeItem {
    const cfg = this.config;
    if (!cfg) {
      return new vscode.TreeItem('');
    }
    return this.coordinator.getSlotTreeItem(cfg, element);
  }

  getChildren(element?: FacetSlotItem): Promise<FacetSlotItem[]> {
    const cfg = this.config;
    if (!cfg) {
      return Promise.resolve([]);
    }
    return this.coordinator.getSlotChildren(cfg, element);
  }

  getParent(element: FacetSlotItem): FacetSlotItem | undefined {
    const cfg = this.config;
    if (!cfg) {
      return undefined;
    }
    return this.coordinator.getSlotParent(cfg, element);
  }
}
