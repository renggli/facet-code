import * as vscode from 'vscode';
import { type FilesPaneConfig, matchesGlob } from '../../models/paneConfig';
import { getPathBasename, getRelativePath } from '../../shared/pathUtils';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';
import type { DirectoryNode } from './directoriesPane';

export class FilesPaneDefinition implements PaneDefinition<FilesPaneConfig, vscode.Uri> {
  public readonly role = 'files';
  public readonly title = 'Files';
  public readonly icon = 'file-code';
  public readonly description = 'Workspace file navigator';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSorts: ['position', 'name'],
    hasTreeToggle: true,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): FilesPaneConfig {
    return {
      id: slotId,
      role: 'files',
      title: 'Files',
      visible: true,
      inputSource: 'previousPane',
      sort: 'name',
      tree: false,
    };
  }

  public async getChildren(
    context: PaneExecutionContext<FilesPaneConfig>,
    _element?: vscode.Uri,
  ): Promise<vscode.Uri[]> {
    const config = context.config;
    const isRecursive = Boolean(config.tree);
    let files: vscode.Uri[] = [];

    if (config.inputSource === 'project') {
      let workspaceFiles = context.coordinator.getCachedWorkspaceFiles();
      if (workspaceFiles.length === 0) {
        try {
          workspaceFiles = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist,out,build}/**');
          context.coordinator.setCachedWorkspaceFiles(workspaceFiles);
        } catch {
          workspaceFiles = [];
        }
      }
      if (isRecursive) {
        files = [...workspaceFiles];
      } else {
        files = workspaceFiles.filter((u) => {
          let rel = u.fsPath.replace(/\\/g, '/');
          if (vscode.workspace.asRelativePath) {
            try {
              rel = vscode.workspace.asRelativePath(u);
            } catch {
              // fallback
            }
          } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const root = vscode.workspace.workspaceFolders[0].uri.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
            if (rel.startsWith(`${root}/`)) {
              rel = rel.slice(root.length + 1);
            }
          }
          rel = rel.replace(/^\/+/, '');
          return !rel.includes('/');
        });
      }
    } else if (config.inputSource === 'openEditors') {
      files = context.coordinator.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      const activeUri =
        config.pinned && config.pinnedUri
          ? vscode.Uri.parse(config.pinnedUri)
          : (context.activeEditor?.document.uri ?? vscode.window.activeTextEditor?.document.uri);
      if (activeUri) {
        files = [activeUri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevItems =
        context.upstreamOutput.items && context.upstreamOutput.items.length > 0
          ? context.upstreamOutput.items
          : context.coordinator.getPreviousPaneSelection(config.id);

      const dirPaths = prevItems
        .filter((item): item is { uri?: vscode.Uri; fsPath?: string; type?: string } => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          const candidate = item as { type?: string; path?: string };
          return candidate.type === 'directory' || (item instanceof vscode.Uri && !item.path.includes('.'));
        })
        .map((item) => (item.uri ? item.uri.fsPath : (item as vscode.Uri).fsPath));
      const prevPane = context.coordinator.getPreviousPane(config.id);
      const isUpstreamDirectories = prevPane?.role === 'directories';

      if (dirPaths.length === 0 && isUpstreamDirectories && prevPane) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          for (const wf of workspaceFolders) {
            dirPaths.push(wf.uri.fsPath);
          }
        } else {
          const prevChildren = await context.coordinator.getSlotChildren(prevPane);
          for (const c of prevChildren) {
            const maybeDir = c as Partial<DirectoryNode>;
            if (maybeDir.uri && maybeDir.type === 'directory') {
              dirPaths.push(maybeDir.uri.fsPath);
            }
          }
        }
      }

      if (dirPaths.length > 0) {
        let workspaceFiles = context.coordinator.getCachedWorkspaceFiles();
        if (workspaceFiles.length === 0) {
          try {
            workspaceFiles = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist,out,build}/**');
            context.coordinator.setCachedWorkspaceFiles(workspaceFiles);
          } catch {
            workspaceFiles = [];
          }
        }
        files = workspaceFiles.filter((file) => {
          const normFile = file.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
          return dirPaths.some((dir) => {
            const normDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
            const lastSlash = normFile.lastIndexOf('/');
            const fileDir = lastSlash !== -1 ? normFile.slice(0, lastSlash) : '';
            return fileDir === normDir;
          });
        });
      } else if (!isUpstreamDirectories) {
        let rawFiles =
          context.upstreamOutput.uris && context.upstreamOutput.uris.length > 0
            ? context.upstreamOutput.uris
            : prevItems
                .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
                .filter((u): u is vscode.Uri => u instanceof vscode.Uri);

        if (rawFiles.length === 0 && prevPane) {
          const prevChildren = await context.coordinator.getSlotChildren(prevPane);
          rawFiles = prevChildren
            .map((item) => (item instanceof vscode.Uri ? item : (item as { uri?: vscode.Uri })?.uri))
            .filter((u): u is vscode.Uri => u instanceof vscode.Uri);
        }

        const seen = new Set<string>();
        files = rawFiles.filter((u) => {
          if (!u?.fsPath || seen.has(u.fsPath)) {
            return false;
          }
          seen.add(u.fsPath);
          return true;
        });
      }
    }

    const pattern = config.globPattern;
    if (pattern?.trim()) {
      files = files.filter((u) => {
        const relPath = getRelativePath(u);
        return matchesGlob(relPath, pattern);
      });
    }

    files.sort((a, b) => {
      const pathA = getRelativePath(a);
      const pathB = getRelativePath(b);
      if (config.sort === 'name') {
        const nameA = getPathBasename(a);
        const nameB = getPathBasename(b);
        const diff = nameA.localeCompare(nameB);
        if (diff !== 0) {
          return diff;
        }
      }
      return pathA.localeCompare(pathB);
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

  public async configureFilter(config: FilesPaneConfig): Promise<boolean> {
    const currentVal = config.globPattern ?? '';
    const pattern = await vscode.window.showInputBox({
      value: currentVal,
      prompt: 'Enter glob pattern on full path (e.g. src/**/*.ts, !*test*)',
      placeHolder: 'e.g. src/**/*.ts',
    });
    if (pattern !== undefined) {
      config.globPattern = pattern.trim() ? pattern.trim() : undefined;
      return true;
    }
    return false;
  }
}
