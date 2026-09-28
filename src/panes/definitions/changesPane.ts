import * as vscode from 'vscode';
import type { PaneConfig } from '../../models/paneConfig';
import { getPathBasename, getRelativePath } from '../../shared/pathUtils';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

interface GitChange {
  uri?: vscode.Uri;
}

interface GitRepository {
  state?: {
    workingTreeChanges?: GitChange[];
    indexChanges?: GitChange[];
  };
}

interface GitApi {
  repositories?: GitRepository[];
}

interface GitExtensionExports {
  getAPI?(version: number): GitApi;
}

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
    const textDocs = vscode.workspace.textDocuments ?? [];
    const dirtyDocs = textDocs.filter((d) => d.isDirty && d.uri.scheme === 'file').map((d) => d.uri);

    const changedUris = new Map<string, vscode.Uri>();
    for (const u of dirtyDocs) {
      changedUris.set(u.fsPath, u);
    }

    try {
      const gitExt = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
      if (gitExt) {
        const git = gitExt.exports?.getAPI ? gitExt.exports.getAPI(1) : undefined;
        if (git?.repositories) {
          for (const repo of git.repositories) {
            const changes = [...(repo.state?.workingTreeChanges ?? []), ...(repo.state?.indexChanges ?? [])];
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
      const activeUri =
        config.pinned && config.pinnedUri
          ? vscode.Uri.parse(config.pinnedUri)
          : (context.activeEditor?.document.uri ?? vscode.window.activeTextEditor?.document.uri);
      files = activeUri && changedUris.has(activeUri.fsPath) ? [activeUri] : [];
    } else if (config.inputSource === 'openEditors') {
      const openUris = new Set(context.coordinator.getOpenEditorUris().map((u) => u.fsPath));
      files = files.filter((u) => openUris.has(u.fsPath));
    } else if (config.inputSource === 'previousPane') {
      const prevItems = context.upstreamOutput.items ?? [];
      const upstreamPaths = (context.upstreamOutput.uris ?? []).map((u) => u.fsPath);
      const itemPaths = prevItems
        .map((i) => {
          if (i instanceof vscode.Uri) {
            return i.fsPath;
          }
          if (i && typeof i === 'object' && 'uri' in i) {
            const candidate = (i as { uri?: vscode.Uri }).uri;
            return candidate instanceof vscode.Uri ? candidate.fsPath : undefined;
          }
          return undefined;
        })
        .filter((p): p is string => Boolean(p));

      const prevPaths = new Set<string>([...upstreamPaths, ...itemPaths]);
      files = files.filter((u) => prevPaths.has(u.fsPath));
    }

    files.sort((a, b) => {
      if (config.sort === 'name') {
        const nameA = getPathBasename(a);
        const nameB = getPathBasename(b);
        const nameDiff = nameA.localeCompare(nameB);
        if (nameDiff !== 0) {
          return nameDiff;
        }
        return a.fsPath.localeCompare(b.fsPath);
      }
      return a.fsPath.localeCompare(b.fsPath);
    });

    return files;
  }

  public getTreeItem(item: vscode.Uri): vscode.TreeItem {
    const fileName = getPathBasename(item);
    const relPath = getRelativePath(item);
    const treeItem = new vscode.TreeItem(fileName, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = item;
    treeItem.contextValue = 'facetFile';
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
