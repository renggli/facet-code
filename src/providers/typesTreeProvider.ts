import * as vscode from 'vscode';
import { FacetSymbolNode, isTypeKind } from '../models/symbolNode';

export type TypesScope = 'file' | 'project';

export class TypesTreeProvider implements vscode.TreeDataProvider<FacetSymbolNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FacetSymbolNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public scope: TypesScope = 'file';
  private types: FacetSymbolNode[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setSymbols(symbols: FacetSymbolNode[]): void {
    this.types = this.extractTypes(symbols);
    this.refresh();
  }

  setTypes(types: FacetSymbolNode[]): void {
    this.types = types;
    this.refresh();
  }

  public extractTypes(symbols: FacetSymbolNode[]): FacetSymbolNode[] {
    const result: FacetSymbolNode[] = [];

    const walk = (nodes: FacetSymbolNode[]) => {
      for (const node of nodes) {
        if (isTypeKind(node.kind)) {
          result.push(node);
        }
        if (node.children && node.children.length > 0) {
          walk(node.children);
        }
      }
    };

    walk(symbols);
    return result;
  }

  getTypes(): FacetSymbolNode[] {
    return this.types;
  }

  getTreeItem(element: FacetSymbolNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);

    if (this.scope === 'project') {
      const fileName = element.uri.path.split('/').pop() || '';
      item.description = element.detail ? `${fileName} • ${element.detail}` : fileName;
    } else {
      item.description = element.detail;
    }

    switch (element.kind) {
      case vscode.SymbolKind.Interface:
        item.iconPath = new vscode.ThemeIcon('symbol-interface');
        break;
      case vscode.SymbolKind.Enum:
        item.iconPath = new vscode.ThemeIcon('symbol-enum');
        break;
      case vscode.SymbolKind.Struct:
        item.iconPath = new vscode.ThemeIcon('symbol-struct');
        break;
      default:
        item.iconPath = new vscode.ThemeIcon('symbol-class');
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
      return this.types;
    }
    return [];
  }
}
