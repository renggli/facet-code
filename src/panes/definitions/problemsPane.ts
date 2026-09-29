import * as vscode from 'vscode';
import type { PaneConfig, SortOption } from '../../models/paneConfig';
import { getRelativePath } from '../../shared/pathUtils';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export interface ProblemItem {
  type: 'problem';
  label: string;
  message: string;
  description: string;
  tooltip: string;
  severity: vscode.DiagnosticSeverity;
  uri: vscode.Uri;
  range: vscode.Range;
  iconPath: vscode.ThemeIcon;
}

export class ProblemsPaneDefinition implements PaneDefinition<PaneConfig, ProblemItem> {
  public readonly role = 'problems';
  public readonly title = 'Problems';
  public readonly icon = 'warning';
  public readonly description = 'Workspace and editor diagnostic problems';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSorts: ['position', 'name', 'category'],
    hasTreeToggle: false,
    hasFilter: false,
  };

  public defaultConfig(slotId: string): PaneConfig {
    return {
      id: slotId,
      role: 'problems',
      title: 'Problems',
      visible: true,
      inputSource: 'project',
      sort: 'category',
    } as PaneConfig;
  }

  public async getChildren(context: PaneExecutionContext<PaneConfig>, _element?: ProblemItem): Promise<ProblemItem[]> {
    const config = context.config;
    let candidateUris: vscode.Uri[] = [];

    if (config.inputSource === 'project') {
      const allDiags = vscode.languages.getDiagnostics();
      const items: ProblemItem[] = [];
      for (const [uri, diags] of allDiags) {
        for (const d of diags) {
          items.push(this.createProblemItem(uri, d));
        }
      }
      return this.sortProblems(items, config.sort);
    }

    if (config.inputSource === 'openEditors') {
      candidateUris = context.coordinator.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      const activeUri =
        config.pinned && config.pinnedUri
          ? vscode.Uri.parse(config.pinnedUri)
          : (context.activeEditor?.document.uri ?? vscode.window.activeTextEditor?.document.uri);
      if (activeUri) {
        candidateUris = [activeUri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevItems = context.upstreamOutput.items ?? [];
      candidateUris =
        context.upstreamOutput.uris && context.upstreamOutput.uris.length > 0
          ? context.upstreamOutput.uris
          : prevItems
              .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
              .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
    }

    const items: ProblemItem[] = [];
    for (const uri of candidateUris) {
      const diags = vscode.languages.getDiagnostics(uri);
      for (const d of diags) {
        items.push(this.createProblemItem(uri, d));
      }
    }
    return this.sortProblems(items, config.sort);
  }

  public createProblemItem(uri: vscode.Uri, d: vscode.Diagnostic): ProblemItem {
    const relPath = getRelativePath(uri);
    const lineNum = d.range.start.line + 1;
    let icon = new vscode.ThemeIcon('info');
    if (d.severity === vscode.DiagnosticSeverity.Error) {
      icon = new vscode.ThemeIcon('error');
    } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
      icon = new vscode.ThemeIcon('warning');
    }

    return {
      type: 'problem',
      label: d.message,
      message: d.message,
      description: `${relPath}:${lineNum}`,
      tooltip: `[${vscode.DiagnosticSeverity[d.severity]}] ${d.message} (${relPath}:${lineNum})`,
      severity: d.severity,
      uri,
      range: d.range,
      iconPath: icon,
    };
  }

  public getTreeItem(item: ProblemItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(item.label, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = item.uri;
    treeItem.contextValue = 'facetProblem';
    treeItem.description = item.description;
    treeItem.tooltip = item.tooltip;
    treeItem.iconPath = item.iconPath;
    treeItem.command = {
      command: 'facet.revealRange',
      title: 'Reveal Problem',
      arguments: [item.uri, item.range],
    };
    return treeItem;
  }

  public getOutput(items: readonly ProblemItem[]): PaneOutput {
    return {
      items: Array.from(items),
      uris: items.map((p) => p.uri),
    };
  }

  // --- Private Helpers at Bottom ---

  private sortProblems(items: ProblemItem[], sort: SortOption): ProblemItem[] {
    return items.sort((a, b) => {
      if (sort === 'category') {
        const sevDiff = a.severity - b.severity;
        if (sevDiff !== 0) {
          return sevDiff;
        }
      }
      if (sort === 'name') {
        const msgDiff = a.message.localeCompare(b.message);
        if (msgDiff !== 0) {
          return msgDiff;
        }
      }
      const uriDiff = a.uri.fsPath.localeCompare(b.uri.fsPath);
      if (uriDiff !== 0) {
        return uriDiff;
      }
      const lineDiff = a.range.start.line - b.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return a.range.start.character - b.range.start.character;
    });
  }
}
