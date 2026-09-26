import * as vscode from 'vscode';
import { PaneConfig } from '../models/paneConfig';
import { FacetCoordinator } from '../coordinator/facetCoordinator';

export class SlotTreeProvider implements vscode.TreeDataProvider<any> {
  private _onDidChangeTreeData = new vscode.EventEmitter<any | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    public readonly config: PaneConfig,
    private readonly coordinator: FacetCoordinator
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: any): vscode.TreeItem {
    return this.coordinator.getSlotTreeItem(this.config, element);
  }

  getChildren(element?: any): Promise<any[]> {
    return this.coordinator.getSlotChildren(this.config, element);
  }

  getParent(element: any): any | undefined {
    return this.coordinator.getSlotParent(this.config, element);
  }
}
