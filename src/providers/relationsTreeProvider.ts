import * as vscode from 'vscode';
import { type FacetSymbolNode, resolveExactSymbolPosition } from '../models/symbolNode';

export type RelationsMode = 'references' | 'callers' | 'implementations' | 'definitions' | 'declarations';

export interface RelationItem {
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon;
  uri: vscode.Uri;
  range: vscode.Range;
  kind?: vscode.SymbolKind;
}

export class RelationsTreeProvider {
  async fetchRelationsForNodes(
    nodes: readonly FacetSymbolNode[],
    mode: RelationsMode,
    token?: vscode.CancellationToken,
  ): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const allResults: RelationItem[] = [];

    for (const node of nodes) {
      if (token?.isCancellationRequested) {
        break;
      }
      switch (mode) {
        case 'references': {
          const refs = await this.fetchReferencesForNode(node, token);
          allResults.push(...refs);
          break;
        }
        case 'callers': {
          const callers = await this.fetchCallersForNode(node, token);
          allResults.push(...callers);
          break;
        }
        case 'implementations': {
          const impls = await this.fetchImplementationsForNode(node, token);
          allResults.push(...impls);
          break;
        }
        case 'definitions': {
          const defs = await this.fetchDefinitionsForNode(node, token);
          allResults.push(...defs);
          break;
        }
        case 'declarations': {
          const decls = await this.fetchDeclarationsForNode(node, token);
          allResults.push(...decls);
          break;
        }
      }
    }

    return allResults;
  }

  async fetchReferencesForNode(node: FacetSymbolNode, token?: vscode.CancellationToken): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const pos = await resolveExactSymbolPosition(node);
    if (token?.isCancellationRequested) {
      return [];
    }
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      node.uri,
      pos,
    );

    if (token?.isCancellationRequested || !locations || locations.length === 0) {
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
        range: loc.range,
        kind: node.kind,
      });
    }

    return items;
  }

  async fetchCallersForNode(node: FacetSymbolNode, token?: vscode.CancellationToken): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const pos = await resolveExactSymbolPosition(node);
    if (token?.isCancellationRequested) {
      return [];
    }
    let items: vscode.CallHierarchyItem[] | undefined;
    try {
      items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        node.uri,
        pos,
      );
    } catch {
      items = undefined;
    }

    if (token?.isCancellationRequested) {
      return [];
    }

    if (items && items.length > 0) {
      try {
        const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
          'vscode.provideIncomingCalls',
          items[0],
        );

        if (token?.isCancellationRequested) {
          return [];
        }

        if (calls && calls.length > 0) {
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
              range: from.selectionRange,
              kind: from.kind,
            };
          });
        }
      } catch {
        // Fall back to reference-based caller discovery
      }
    }

    return this.fetchCallersViaReferences(node, pos, token);
  }

  async fetchImplementationsForNode(node: FacetSymbolNode, token?: vscode.CancellationToken): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const pos = await resolveExactSymbolPosition(node);
    if (token?.isCancellationRequested) {
      return [];
    }
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeImplementationProvider',
      node.uri,
      pos,
    );

    if (token?.isCancellationRequested || !locations || locations.length === 0) {
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
        range: loc.range,
        kind: node.kind,
      });
    }

    return items;
  }

  async fetchDefinitionsForNode(node: FacetSymbolNode, token?: vscode.CancellationToken): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const pos = await resolveExactSymbolPosition(node);
    if (token?.isCancellationRequested) {
      return [];
    }
    const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      node.uri,
      pos,
    );

    if (token?.isCancellationRequested || !locations || locations.length === 0) {
      return [];
    }

    const items: RelationItem[] = [];
    for (const loc of locations) {
      const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
      const range = 'targetRange' in loc ? loc.targetRange : loc.range;
      const relPath = vscode.workspace.asRelativePath(uri);
      const lineNum = range.start.line + 1;
      const snippet = await getLineSnippet(uri, range.start.line, node.name);

      items.push({
        label: snippet,
        description: `${relPath}:${lineNum}`,
        tooltip: `Definition in ${uri.fsPath}:${lineNum}\n${snippet}`,
        iconPath: new vscode.ThemeIcon('symbol-field'),
        uri,
        range,
        kind: node.kind,
      });
    }

    return items;
  }

  async fetchDeclarationsForNode(node: FacetSymbolNode, token?: vscode.CancellationToken): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    const pos = await resolveExactSymbolPosition(node);
    if (token?.isCancellationRequested) {
      return [];
    }
    const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDeclarationProvider',
      node.uri,
      pos,
    );

    if (token?.isCancellationRequested || !locations || locations.length === 0) {
      return [];
    }

    const items: RelationItem[] = [];
    for (const loc of locations) {
      const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
      const range = 'targetRange' in loc ? loc.targetRange : loc.range;
      const relPath = vscode.workspace.asRelativePath(uri);
      const lineNum = range.start.line + 1;
      const snippet = await getLineSnippet(uri, range.start.line, node.name);

      items.push({
        label: snippet,
        description: `${relPath}:${lineNum}`,
        tooltip: `Declaration in ${uri.fsPath}:${lineNum}\n${snippet}`,
        iconPath: new vscode.ThemeIcon('symbol-interface'),
        uri,
        range,
        kind: node.kind,
      });
    }

    return items;
  }

  getTreeItem(element: RelationItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.description = element.description;
    item.tooltip = element.tooltip;
    item.iconPath = element.iconPath ?? new vscode.ThemeIcon('references');
    item.resourceUri = element.uri;
    item.contextValue = 'facetRelation';
    item.command = {
      command: 'facet.revealRange',
      title: 'Reveal in Editor',
      arguments: [element.uri, element.range],
    };
    return item;
  }

  private async fetchCallersViaReferences(
    node: FacetSymbolNode,
    pos: vscode.Position,
    token?: vscode.CancellationToken,
  ): Promise<RelationItem[]> {
    if (token?.isCancellationRequested) {
      return [];
    }
    let locations: vscode.Location[] | undefined;
    try {
      locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        node.uri,
        pos,
      );
    } catch {
      locations = undefined;
    }

    if (token?.isCancellationRequested || !locations || locations.length === 0) {
      return [];
    }

    const items: RelationItem[] = [];
    for (const loc of locations) {
      const isSelf = loc.uri.toString() === node.uri.toString() && loc.range.contains(pos);
      if (isSelf) {
        continue;
      }

      const relPath = vscode.workspace.asRelativePath(loc.uri);
      const lineNum = loc.range.start.line + 1;
      const snippet = await getLineSnippet(loc.uri, loc.range.start.line, `${node.name}()`);

      items.push({
        label: snippet,
        description: `${relPath}:${lineNum}`,
        tooltip: `Call site in ${loc.uri.fsPath}:${lineNum}\n${snippet}`,
        iconPath: new vscode.ThemeIcon('call-incoming'),
        uri: loc.uri,
        range: loc.range,
        kind: node.kind,
      });
    }

    return items;
  }
}

// --- Internal Utility Functions at Bottom ---

async function getLineSnippet(uri: vscode.Uri, lineIndex: number, fallback: string): Promise<string> {
  const openDoc = (vscode.workspace.textDocuments ?? []).find((d) => d.uri.toString() === uri.toString());
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
