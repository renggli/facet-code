import * as vscode from 'vscode';
import { MemberCategory } from '../models/symbolNode';

export interface CategoryItem {
  id: MemberCategory;
  label: string;
  icon: string;
  count?: number;
}

export class CategoriesTreeProvider implements vscode.TreeDataProvider<CategoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CategoryItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private selectedCategory: MemberCategory = MemberCategory.All;
  private categoryCounts: Partial<Record<MemberCategory, number>> = {};

  private readonly categories: { id: MemberCategory; label: string; icon: string }[] = [
    { id: MemberCategory.All, label: 'All Members', icon: 'list-unordered' },
    { id: MemberCategory.Constructors, label: 'Constructors', icon: 'symbol-constructor' },
    { id: MemberCategory.Fields, label: 'Fields & Properties', icon: 'symbol-field' },
    { id: MemberCategory.InstanceMethods, label: 'Instance Methods', icon: 'symbol-method' },
    { id: MemberCategory.StaticMethods, label: 'Static Methods', icon: 'symbol-constant' },
    { id: MemberCategory.Accessors, label: 'Accessors (Get/Set)', icon: 'symbol-property' }
  ];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setSelectedCategory(category: MemberCategory): void {
    this.selectedCategory = category;
    this.refresh();
  }

  getSelectedCategory(): MemberCategory {
    return this.selectedCategory;
  }

  setCounts(counts: Partial<Record<MemberCategory, number>>): void {
    this.categoryCounts = counts;
    this.refresh();
  }

  getTreeItem(element: CategoryItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(element.icon);
    const count = this.categoryCounts[element.id];
    item.description = count !== undefined ? `${count}` : undefined;

    if (element.id === this.selectedCategory) {
      item.description = count !== undefined ? `${count} (active)` : '(active)';
    }

    item.command = {
      command: 'facet.selectCategory',
      title: 'Select Category',
      arguments: [element.id]
    };

    return item;
  }

  getChildren(): vscode.ProviderResult<CategoryItem[]> {
    return this.categories;
  }
}
