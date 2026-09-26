import * as vscode from 'vscode';
import { FacetSymbolNode } from '../models/symbolNode';

export type RelationsMode = 'references' | 'callers' | 'implementations';

export interface RelationItem {
  label: string;
  description?: string;
  uri: vscode.Uri;
  range: vscode.Range;
}

export class RelationsTreeProvider implements vscode.TreeDataProvider<RelationItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RelationItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private selectedMembers: FacetSymbolNode[] = [];
  private mode: RelationsMode = 'references';
  private cachedItems: RelationItem[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setMode(mode: RelationsMode): void {
    this.mode = mode;
    void this.fetchRelations();
  }

  getMode(): RelationsMode {
    return this.mode;
  }

  setSelectedMembers(members: FacetSymbolNode[]): void {
    this.selectedMembers = members;
    void this.fetchRelations();
  }

  getSelectedMembers(): FacetSymbolNode[] {
    return this.selectedMembers;
  }

  async fetchRelations(): Promise<void> {
    if (this.selectedMembers.length === 0) {
      this.cachedItems = [];
      this.refresh();
      return;
    }

    const allResults: RelationItem[] = [];

    for (const member of this.selectedMembers) {
      const results = await this.queryForMember(member);
      allResults.push(...results);
    }

    this.cachedItems = allResults;
    this.refresh();
  }

  private async queryForMember(member: FacetSymbolNode): Promise<RelationItem[]> {
    switch (this.mode) {
      case 'references':
        return this.fetchReferences(member);
      case 'callers':
        return this.fetchCallers(member);
      case 'implementations':
        return this.fetchImplementations(member);
      default:
        return [];
    }
  }

  private async fetchReferences(member: FacetSymbolNode): Promise<RelationItem[]> {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      member.uri,
      member.selectionRange.start
    );

    if (!locations || locations.length === 0) {
      return [];
    }

    return locations.map((loc) => {
      const fileName = loc.uri.path.split('/').pop() || '';
      return {
        label: `${member.name} in ${fileName}:${loc.range.start.line + 1}`,
        description: `line ${loc.range.start.line + 1}`,
        uri: loc.uri,
        range: loc.range
      };
    });
  }

  private async fetchCallers(member: FacetSymbolNode): Promise<RelationItem[]> {
    const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      member.uri,
      member.selectionRange.start
    );

    if (!items || items.length === 0) {
      return [];
    }

    const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
      'vscode.provideIncomingCalls',
      items[0]
    );

    if (!calls || calls.length === 0) {
      return [];
    }

    return calls.map((call) => {
      const from = call.from;
      const fileName = from.uri.path.split('/').pop() || '';
      return {
        label: `${from.name} -> ${member.name}`,
        description: `${fileName}:${from.range.start.line + 1}`,
        uri: from.uri,
        range: from.selectionRange
      };
    });
  }

  private async fetchImplementations(member: FacetSymbolNode): Promise<RelationItem[]> {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeImplementationProvider',
      member.uri,
      member.selectionRange.start
    );

    if (!locations || locations.length === 0) {
      return [];
    }

    return locations.map((loc) => {
      const fileName = loc.uri.path.split('/').pop() || '';
      return {
        label: `${member.name} (${fileName})`,
        description: `line ${loc.range.start.line + 1}`,
        uri: loc.uri,
        range: loc.range
      };
    });
  }

  getTreeItem(element: RelationItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.iconPath = new vscode.ThemeIcon(
      this.mode === 'callers' ? 'call-incoming' : this.mode === 'implementations' ? 'type-hierarchy-sub' : 'references'
    );
    item.command = {
      command: 'facet.revealRange',
      title: 'Reveal in Editor',
      arguments: [element.uri, element.range]
    };
    return item;
  }

  getChildren(): vscode.ProviderResult<RelationItem[]> {
    return this.cachedItems;
  }
}
