import * as vscode from 'vscode';
import { type FilesPaneConfig, matchesGlob } from '../../models/paneConfig';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export class FilesPaneDefinition implements PaneDefinition<FilesPaneConfig, vscode.Uri> {
  public readonly role = 'files';
  public readonly title = 'Files';
  public readonly icon = 'file-code';
  public readonly description = 'Workspace file navigator';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSelections: ['cursor', 'all', 'none'],
    supportedSorts: ['position', 'name'],
    hasTreeToggle: true,
    hasRecursiveToggle: true,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): FilesPaneConfig {
    return {
      id: slotId,
      role: 'files',
      title: 'Files',
      visible: true,
      inputSource: 'previousPane',
      selectionSource: 'cursor',
      sort: 'name',
      tree: false,
      recursive: false,
    };
  }

  public async getChildren(
    context: PaneExecutionContext<FilesPaneConfig>,
    _element?: vscode.Uri,
  ): Promise<vscode.Uri[]> {
    const config = context.config;
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
      files = [...workspaceFiles];
    } else if (config.inputSource === 'openEditors') {
      files = context.coordinator.getOpenEditorUris();
    } else if (config.inputSource === 'activeEditor') {
      const activeUri = context.activeEditor?.document.uri || vscode.window.activeTextEditor?.document.uri;
      if (activeUri) {
        files = [activeUri];
      }
    } else if (config.inputSource === 'previousPane') {
      const prevItems =
        context.upstreamOutput.items && context.upstreamOutput.items.length > 0
          ? context.upstreamOutput.items
          : context.coordinator.getPreviousPaneSelection(config.id);

      const dirPaths = prevItems
        .filter((item: any) => item?.type === 'directory' || (item instanceof vscode.Uri && !item.path.includes('.')))
        .map((item: any) => (item?.uri ? item.uri.fsPath : item.fsPath));

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
        const isRecursive = Boolean(config.recursive);
        files = workspaceFiles.filter((file) => {
          const normFile = file.fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
          return dirPaths.some((dir) => {
            const normDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
            if (isRecursive) {
              return normFile.startsWith(normDir + '/');
            }
            const lastSlash = normFile.lastIndexOf('/');
            const fileDir = lastSlash !== -1 ? normFile.slice(0, lastSlash) : '';
            return fileDir === normDir;
          });
        });
      } else {
        let rawFiles =
          context.upstreamOutput.uris && context.upstreamOutput.uris.length > 0
            ? context.upstreamOutput.uris
            : prevItems
                .map((item: any) => (item instanceof vscode.Uri ? item : item?.uri))
                .filter((u: any): u is vscode.Uri => u instanceof vscode.Uri);

        if (rawFiles.length === 0) {
          const prevPane = context.coordinator.getPreviousPane(config.id);
          if (prevPane) {
            const prevChildren = await context.coordinator.getSlotChildren(prevPane);
            rawFiles = prevChildren
              .map((item: any) => (item instanceof vscode.Uri ? item : item?.uri))
              .filter((u: any): u is vscode.Uri => u instanceof vscode.Uri);
          }
        }

        const seen = new Set<string>();
        files = rawFiles.filter((u) => {
          if (!u || !u.fsPath || seen.has(u.fsPath)) {
            return false;
          }
          seen.add(u.fsPath);
          return true;
        });
      }
    }

    const pattern = config.globPattern;
    if (pattern && pattern.trim()) {
      files = files.filter((u) => {
        const relPath = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(u) : u.fsPath;
        return matchesGlob(relPath, pattern);
      });
    }

    files.sort((a, b) => {
      const pathA = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(a) : a.fsPath;
      const pathB = vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(b) : b.fsPath;
      if (config.sort === 'name') {
        const nameA = a.path.split('/').pop() || '';
        const nameB = b.path.split('/').pop() || '';
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

  public async configureFilter(config: FilesPaneConfig): Promise<boolean> {
    const currentVal = config.globPattern || '';
    const pattern = await vscode.window.showInputBox({
      value: currentVal,
      prompt: 'Enter glob pattern on full path (e.g. src/**/*.ts, !*test*)',
      placeHolder: 'e.g. src/**/*.ts',
    });
    if (pattern !== undefined) {
      config.globPattern = pattern.trim() || undefined;
      return true;
    }
    return false;
  }
}
