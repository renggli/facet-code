import * as vscode from 'vscode';
import {
  FacetSymbolNode,
  MemberCategory,
  ClassSide,
  LayoutMode,
  filterMembers,
  unionMembers
} from '../models/symbolNode';

export class MembersTreeProvider implements vscode.TreeDataProvider<FacetSymbolNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FacetSymbolNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private selectedTypes: readonly FacetSymbolNode[] = [];
  private activeCategory: MemberCategory = MemberCategory.All;
  private classSide: ClassSide = 'both';
  private layoutMode: LayoutMode = 'list';

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setSelectedTypes(types: readonly FacetSymbolNode[]): void {
    this.selectedTypes = types;
    this.refresh();
  }

  setActiveCategory(category: MemberCategory): void {
    this.activeCategory = category;
    this.refresh();
  }

  setClassSide(side: ClassSide): void {
    this.classSide = side;
    this.refresh();
  }

  setLayoutMode(layout: LayoutMode): void {
    this.layoutMode = layout;
    this.refresh();
  }

  getClassSide(): ClassSide {
    return this.classSide;
  }

  getLayoutMode(): LayoutMode {
    return this.layoutMode;
  }

  getActiveCategory(): MemberCategory {
    return this.activeCategory;
  }

  getCategoryCounts(): Partial<Record<MemberCategory, number>> {
    const allMembers = unionMembers(this.selectedTypes);
    const counts: Partial<Record<MemberCategory, number>> = {
      [MemberCategory.All]: allMembers.length
    };

    for (const member of allMembers) {
      counts[member.category] = (counts[member.category] || 0) + 1;
    }
    return counts;
  }

  getFilteredMembers(): FacetSymbolNode[] {
    const rawUnion = unionMembers(this.selectedTypes);
    const filtered = filterMembers(rawUnion, this.activeCategory, this.classSide);

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  getTreeItem(element: FacetSymbolNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);

    let desc = element.detail || '';
    if (this.selectedTypes.length > 1 && element.parent) {
      desc = desc ? `[${element.parent.name}] ${desc}` : `[${element.parent.name}]`;
    }
    if (element.isStatic) {
      desc = desc ? `static ${desc}` : 'static';
    }
    item.description = desc;

    switch (element.category) {
      case MemberCategory.Constructors:
        item.iconPath = new vscode.ThemeIcon('symbol-constructor');
        break;
      case MemberCategory.Fields:
        item.iconPath = new vscode.ThemeIcon('symbol-field');
        break;
      case MemberCategory.Accessors:
        item.iconPath = new vscode.ThemeIcon('symbol-property');
        break;
      case MemberCategory.StaticMethods:
      case MemberCategory.Constants:
        item.iconPath = new vscode.ThemeIcon('symbol-constant');
        break;
      default:
        item.iconPath = new vscode.ThemeIcon('symbol-method');
        break;
    }

    item.command = {
      command: 'facet.revealRange',
      title: 'Reveal in Editor',
      arguments: [element.uri, element.selectionRange]
    };

    return item;
  }

  getChildren(element?: FacetSymbolNode): vscode.ProviderResult<FacetSymbolNode[]> {
    if (!element) {
      return this.getFilteredMembers();
    }
    return [];
  }
}
