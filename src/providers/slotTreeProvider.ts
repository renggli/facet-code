import * as vscode from 'vscode';
import type { FacetCoordinator } from '../coordinator/facetCoordinator';
import type { PaneConfig } from '../models/paneConfig';

export class SlotTreeProvider implements vscode.TreeDataProvider<any> {
  private _onDidChangeTreeData = new vscode.EventEmitter<any | undefined | void>();
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
    return this.explicitConfig || this.coordinator.getPipelineManager()?.getPane(this.slotId);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: any): vscode.TreeItem {
    const cfg = this.config;
    if (!cfg) {
      return new vscode.TreeItem('');
    }
    return this.coordinator.getSlotTreeItem(cfg, element);
  }

  getChildren(element?: any): Promise<any[]> {
    const cfg = this.config;
    if (!cfg) {
      return Promise.resolve([]);
    }
    return this.coordinator.getSlotChildren(cfg, element);
  }

  getParent(element: any): any | undefined {
    const cfg = this.config;
    if (!cfg) {
      return undefined;
    }
    return this.coordinator.getSlotParent(cfg, element);
  }
}
