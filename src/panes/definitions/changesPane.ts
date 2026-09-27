import * as vscode from 'vscode';
import type { PaneConfig } from '../../models/paneConfig';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export class ChangesPaneDefinition implements PaneDefinition<PaneConfig, vscode.Uri> {
  public readonly role = 'changes';
  public readonly title = 'Changes';
  public readonly icon = 'git-commit';
  public readonly description = 'Dirty and modified files';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSelections: ['cursor', 'all', 'none'],
    supportedSorts: ['position', 'name'],
    hasTreeToggle: false,
    hasFilter: false,
  };

  public defaultConfig(slotId: string): PaneConfig {
    return {
      id: slotId,
      role: 'changes',
      title: 'Changes',
      visible: true,
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
    } as PaneConfig;
  }

  public async getChildren(context: PaneExecutionContext<PaneConfig>, _element?: vscode.Uri): Promise<vscode.Uri[]> {
    const config = context.config;
    const dirtyDocs = (vscode.workspace.textDocuments || [])
      .filter((d) => d.isDirty && d.uri.scheme === 'file')
      .map((d) => d.uri);

    const changedUris = new Map<string, vscode.Uri>();
    for (const u of dirtyDocs) {
      changedUris.set(u.fsPath, u);
    }

    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (gitExt) {
        const git = (gitExt.exports as any)?.getAPI ? (gitExt.exports as any).getAPI(1) : undefined;
        if (git && git.repositories) {
          for (const repo of git.repositories) {
            const changes = [...(repo.state?.workingTreeChanges || []), ...(repo.state?.indexChanges || [])];
            for (const ch of changes) {
              if (ch.uri) {
                changedUris.set(ch.uri.fsPath, ch.uri);
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    let files = Array.from(changedUris.values());

    if (config.inputSource === 'activeEditor') {
      const activeUri = context.activeEditor?.document.uri;
      files = activeUri && changedUris.has(activeUri.fsPath) ? [activeUri] : [];
    } else if (config.inputSource === 'openEditors') {
      const openUris = new Set(context.coordinator.getOpenEditorUris().map((u) => u.fsPath));
      files = files.filter((u) => openUris.has(u.fsPath));
    } else if (config.inputSource === 'previousPane') {
      const prevItems = context.upstreamOutput.items || [];
      const prevPaths = new Set(
        (
          context.upstreamOutput.uris ||
          prevItems.map((i: any) => (i instanceof vscode.Uri ? i.fsPath : i?.uri?.fsPath))
        ).filter(Boolean),
      );
      files = files.filter((u) => prevPaths.has(u.fsPath));
    }

    files.sort((a, b) => {
      if (config.sort === 'name') {
        const nameA = a.path.split('/').pop() || '';
        const nameB = b.path.split('/').pop() || '';
        return nameA.localeCompare(nameB) || a.fsPath.localeCompare(b.fsPath);
      }
      return a.fsPath.localeCompare(b.fsPath);
    });

    return files;
  }

  public getTreeItem(item: vscode.Uri): vscode.TreeItem {
    const fileName = item.path?.split('/').pop() || item.fsPath || 'file';
    let relPath = '';
    try {
      relPath = (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(item) : item.fsPath) || '';
    } catch {
      relPath = item.fsPath || item.path || '';
    }
    const treeItem = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
    if (relPath) {
      const lastSlash = relPath.lastIndexOf('/');
      treeItem.description = lastSlash !== -1 ? relPath.slice(0, lastSlash) : undefined;
    }
    treeItem.iconPath = vscode.ThemeIcon.File;
    treeItem.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [item],
    };
    return treeItem;
  }

  public getOutput(items: readonly vscode.Uri[]): PaneOutput {
    return {
      uris: Array.from(items),
      items: Array.from(items),
    };
  }
}
