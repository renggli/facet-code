import * as vscode from 'vscode';
import { FacetSymbolNode } from '../models/symbolNode';

export type RelationsMode = 'references' | 'callers' | 'implementations';

export interface RelationItem {
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon;
  uri: vscode.Uri;
  range: vscode.Range;
}

async function getLineSnippet(uri: vscode.Uri, lineIndex: number, fallback: string): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (openDoc && lineIndex >= 0 && lineIndex < openDoc.lineCount) {
    const text = openDoc.lineAt(lineIndex).text.trim();
    if (text) {
      return text;
    }
  }

  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    if (lineIndex >= 0 && lineIndex < doc.lineCount) {
      const text = doc.lineAt(lineIndex).text.trim();
      if (text) {
        return text;
      }
    }
  } catch {
    // Fall back to provided label if file cannot be read
  }

  return fallback;
}

export class RelationsTreeProvider implements vscode.TreeDataProvider<RelationItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RelationItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private selectedMembers: readonly FacetSymbolNode[] = [];
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

  setSelectedMembers(members: readonly FacetSymbolNode[]): void {
    this.selectedMembers = members;
    void this.fetchRelations();
  }

  getSelectedMembers(): readonly FacetSymbolNode[] {
    return this.selectedMembers;
  }

  async fetchRelations(): Promise<void> {
    if (this.selectedMembers.length === 0) {
      this.cachedItems = [];
      this.refresh();
      return;
    }

    this.cachedItems = await this.fetchRelationsForNodes(this.selectedMembers, this.mode);
    this.refresh();
  }

  async fetchRelationsForNodes(
    nodes: readonly FacetSymbolNode[],
    mode: RelationsMode
  ): Promise<RelationItem[]> {
    const allResults: RelationItem[] = [];

    for (const node of nodes) {
      switch (mode) {
        case 'references': {
          const refs = await this.fetchReferencesForNode(node);
          allResults.push(...refs);
          break;
        }
        case 'callers': {
          const callers = await this.fetchCallersForNode(node);
          allResults.push(...callers);
          break;
        }
        case 'implementations': {
          const impls = await this.fetchImplementationsForNode(node);
          allResults.push(...impls);
          break;
        }
      }
    }

    return allResults;
  }

  async fetchReferencesForNode(node: FacetSymbolNode): Promise<RelationItem[]> {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      node.uri,
      node.selectionRange.start
    );

    if (!locations || locations.length === 0) {
      return [];
    }

    const items: RelationItem[] = [];
    for (const loc of locations) {
      const relPath = vscode.workspace.asRelativePath(loc.uri);
      const lineNum = loc.range.start.line + 1;
      const snippet = await getLineSnippet(loc.uri, loc.range.start.line, node.name);

      items.push({
        label: snippet,
        description: `${relPath}:${lineNum}`,
        tooltip: `${loc.uri.fsPath}:${lineNum}\n${snippet}`,
        iconPath: new vscode.ThemeIcon('references'),
        uri: loc.uri,
        range: loc.range
      });
    }

    return items;
  }

  async fetchCallersForNode(node: FacetSymbolNode): Promise<RelationItem[]> {
    const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      node.uri,
      node.selectionRange.start
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
      const relPath = vscode.workspace.asRelativePath(from.uri);
      const lineNum = from.range.start.line + 1;
      const container = from.detail ? `${from.detail}.` : '';

      return {
        label: `${container}${from.name}()`,
        description: `${relPath}:${lineNum}`,
        tooltip: `Called from ${container}${from.name}() in ${from.uri.fsPath}:${lineNum}`,
        iconPath: new vscode.ThemeIcon('call-incoming'),
        uri: from.uri,
        range: from.selectionRange
      };
    });
  }

  async fetchImplementationsForNode(node: FacetSymbolNode): Promise<RelationItem[]> {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeImplementationProvider',
      node.uri,
      node.selectionRange.start
    );

    if (!locations || locations.length === 0) {
      return [];
    }

    const items: RelationItem[] = [];
    for (const loc of locations) {
      const relPath = vscode.workspace.asRelativePath(loc.uri);
      const lineNum = loc.range.start.line + 1;
      const snippet = await getLineSnippet(loc.uri, loc.range.start.line, node.name);

      items.push({
        label: snippet,
        description: `${relPath}:${lineNum}`,
        tooltip: `Implementation in ${loc.uri.fsPath}:${lineNum}\n${snippet}`,
        iconPath: new vscode.ThemeIcon('type-hierarchy-sub'),
        uri: loc.uri,
        range: loc.range
      });
    }

    return items;
  }

  getTreeItem(element: RelationItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.iconPath || new vscode.ThemeIcon('references');
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
