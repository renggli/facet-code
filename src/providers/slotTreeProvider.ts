import * as vscode from 'vscode';
import { PaneConfig } from '../models/paneConfig';
import { TypesTreeProvider } from './typesTreeProvider';
import { CategoriesTreeProvider } from './categoriesTreeProvider';
import { MembersTreeProvider } from './membersTreeProvider';
import { RelationsTreeProvider } from './relationsTreeProvider';

export class SlotTreeProvider implements vscode.TreeDataProvider<any> {
  private _onDidChangeTreeData = new vscode.EventEmitter<any | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    public readonly config: PaneConfig,
    private readonly typesProvider: TypesTreeProvider,
    private readonly categoriesProvider: CategoriesTreeProvider,
    private readonly membersProvider: MembersTreeProvider,
    private readonly relationsProvider: RelationsTreeProvider
  ) {
    this.typesProvider.onDidChangeTreeData(() => {
      if (this.config.role === 'types') {
        this.refresh();
      }
    });
    this.categoriesProvider.onDidChangeTreeData(() => {
      if (this.config.role === 'categories') {
        this.refresh();
      }
    });
    this.membersProvider.onDidChangeTreeData(() => {
      if (this.config.role === 'members') {
        this.refresh();
      }
    });
    this.relationsProvider.onDidChangeTreeData(() => {
      if (this.config.role === 'relations') {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: any): vscode.TreeItem {
    switch (this.config.role) {
      case 'types':
        return this.typesProvider.getTreeItem(element);
      case 'categories':
        return this.categoriesProvider.getTreeItem(element);
      case 'members':
        return this.membersProvider.getTreeItem(element);
      case 'relations':
        return this.relationsProvider.getTreeItem(element);
      default:
        return new vscode.TreeItem(element.toString());
    }
  }

  getChildren(element?: any): vscode.ProviderResult<any[]> {
    switch (this.config.role) {
      case 'types':
        return this.typesProvider.getChildren(element);
      case 'categories':
        return this.categoriesProvider.getChildren();
      case 'members':
        return this.membersProvider.getChildren(element);
      case 'relations':
        return this.relationsProvider.getChildren();
      default:
        return [];
    }
  }
}
