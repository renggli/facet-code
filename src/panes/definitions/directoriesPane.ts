import * as vscode from 'vscode';
import { type DirectoriesPaneConfig, matchesGlob } from '../../models/paneConfig';
import { getPathBasename, getRelativePath } from '../../shared/pathUtils';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export interface DirectoryNode {
  type: 'directory';
  uri: vscode.Uri;
  name: string;
  relativePath: string;
  parent?: DirectoryNode;
  children?: DirectoryNode[];
}

export class DirectoriesPaneDefinition implements PaneDefinition<DirectoriesPaneConfig, DirectoryNode> {
  public readonly role = 'directories';
  public readonly title = 'Directories';
  public readonly icon = 'folder';
  public readonly description = 'Workspace directory tree and list navigator';

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['project', 'openEditors', 'activeEditor', 'previousPane'],
    supportedSelections: ['cursor', 'all', 'none'],
    supportedSorts: ['position', 'name'],
    hasTreeToggle: true,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): DirectoriesPaneConfig {
    return {
      id: slotId,
      role: 'directories',
      title: 'Directories',
      visible: true,
      inputSource: 'project',
      selectionSource: 'cursor',
      sort: 'name',
      tree: true,
    };
  }

  public async getChildren(
    context: PaneExecutionContext<DirectoriesPaneConfig>,
    element?: DirectoryNode,
  ): Promise<DirectoryNode[]> {
    if (element && element.type === 'directory') {
      return element.children ?? [];
    }

    const config = context.config;
    let candidateUris: vscode.Uri[] = [];

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
      candidateUris = workspaceFiles;
    } else if (config.inputSource === 'openEditors') {
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
      candidateUris = context.upstreamOutput.uris ?? [];
    }

    const baseDirMap = new Map<string, { uri: vscode.Uri; relPath: string; name: string }>();

    const prevSel =
      config.inputSource === 'previousPane'
        ? (context.upstreamOutput.items ?? context.coordinator.getPreviousPaneSelection(config.id))
        : [];
    const prevDirNodes = prevSel.filter((item): item is DirectoryNode => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      return (item as Partial<DirectoryNode>).type === 'directory';
    });

    for (const dNode of prevDirNodes) {
      if (dNode.relativePath) {
        const normRel = dNode.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (normRel && normRel !== '.') {
          const fallbackName = getPathBasename(normRel);
          baseDirMap.set(normRel, {
            uri: dNode.uri,
            relPath: normRel,
            name: dNode.name ? dNode.name : fallbackName,
          });
        }
      }
    }

    for (const uri of candidateUris) {
      const fullPath = uri.fsPath;
      const lastSlash = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
      if (lastSlash > 0) {
        const dirPath = fullPath.slice(0, lastSlash);
        const dirUri = vscode.Uri.file(dirPath);
        let relPath = '';
        try {
          relPath = getRelativePath(dirUri);
        } catch {
          relPath = dirPath;
        }
        relPath = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (relPath && relPath !== '.') {
          const name = getPathBasename(relPath);
          if (!baseDirMap.has(relPath)) {
            baseDirMap.set(relPath, { uri: dirUri, relPath, name });
          }
        }
      }
    }

    const allDirsMap = new Map<string, { uri: vscode.Uri; relPath: string; name: string }>();
    for (const base of baseDirMap.values()) {
      const parts = base.relPath.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!allDirsMap.has(currentPath)) {
          let segUri = base.uri;
          if (currentPath === base.relPath) {
            segUri = base.uri;
          } else {
            try {
              if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                segUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, currentPath);
              } else {
                segUri = vscode.Uri.file(currentPath);
              }
            } catch {
              segUri = base.uri;
            }
          }
          allDirsMap.set(currentPath, {
            uri: segUri,
            relPath: currentPath,
            name: parts[i],
          });
        }
      }
    }

    const pattern = config.globPattern;
    const isTree = Boolean(config.tree);

    if (!isTree) {
      let flatNodes = Array.from(baseDirMap.values());
      if (config.inputSource === 'previousPane') {
        const prevSelDirs = prevSel.filter((item): item is DirectoryNode => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          return (item as Partial<DirectoryNode>).type === 'directory';
        });
        if (prevSelDirs.length > 0) {
          flatNodes = flatNodes.filter((entry) =>
            prevSelDirs.some((pDir) => {
              const prefix = `${pDir.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/`;
              return entry.relPath.startsWith(prefix);
            }),
          );
        }
      }

      flatNodes = flatNodes.filter((d) => matchesGlob(d.relPath, pattern) || matchesGlob(d.name, pattern));

      flatNodes.sort((a, b) => {
        if (config.sort === 'name') {
          const diff = a.name.localeCompare(b.name);
          if (diff !== 0) {
            return diff;
          }
          return a.relPath.localeCompare(b.relPath);
        }
        return a.relPath.localeCompare(b.relPath);
      });

      return flatNodes.map((d) => ({
        type: 'directory',
        uri: d.uri,
        name: d.name,
        relativePath: d.relPath,
      }));
    }

    // Tree Mode
    const nodeMap = new Map<string, DirectoryNode>();
    for (const d of allDirsMap.values()) {
      nodeMap.set(d.relPath, {
        type: 'directory',
        uri: d.uri,
        name: d.name,
        relativePath: d.relPath,
        children: [],
      });
    }

    const childRelPaths = new Set<string>();
    for (const [relPath, node] of nodeMap) {
      const lastSlash = relPath.lastIndexOf('/');
      if (lastSlash !== -1) {
        const parentRel = relPath.slice(0, lastSlash);
        const parentNode = nodeMap.get(parentRel);
        if (parentNode) {
          node.parent = parentNode;
          parentNode.children = parentNode.children ?? [];
          if (!parentNode.children.some((c) => c.relativePath === node.relativePath)) {
            parentNode.children.push(node);
          }
          childRelPaths.add(relPath);
        }
      }
    }

    const matchesDirectoryFilter = (node: DirectoryNode): boolean => {
      if (!pattern?.trim()) {
        return true;
      }
      return (
        matchesGlob(node.relativePath, pattern) ||
        matchesGlob(node.name, pattern) ||
        node.relativePath.split('/').some((part) => matchesGlob(part, pattern))
      );
    };

    const filterLeaves = (node: DirectoryNode): boolean => {
      if (node.children && node.children.length > 0) {
        node.children = node.children.filter((child) => filterLeaves(child));
        if (node.children.length > 0) {
          return true;
        }
      }
      return matchesDirectoryFilter(node);
    };

    const rootNodes: DirectoryNode[] = [];
    const rootSeen = new Set<string>();

    const allNodes = Array.from(nodeMap.values()).sort(
      (a, b) => a.relativePath.split('/').length - b.relativePath.split('/').length,
    );

    for (const node of allNodes) {
      if (childRelPaths.has(node.relativePath) || node.parent !== undefined) {
        continue;
      }
      if (rootSeen.has(node.relativePath)) {
        continue;
      }

      if (filterLeaves(node)) {
        rootSeen.add(node.relativePath);
        rootNodes.push(node);
      }
    }

    const sortNodes = (nodes: DirectoryNode[]) => {
      nodes.sort((a, b) =>
        config.sort === 'name' ? a.name.localeCompare(b.name) : a.relativePath.localeCompare(b.relativePath),
      );
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          sortNodes(n.children);
        }
      }
    };
    sortNodes(rootNodes);
    return rootNodes;
  }

  public getTreeItem(item: DirectoryNode, context: PaneExecutionContext<DirectoriesPaneConfig>): vscode.TreeItem {
    const isTree = Boolean(context.config.tree);
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const treeItem = new vscode.TreeItem(
      item.name,
      isTree && hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    treeItem.resourceUri = item.uri;
    treeItem.contextValue = 'facetDirectory';
    if (!isTree && item.relativePath) {
      treeItem.description = item.relativePath;
    }
    treeItem.iconPath = vscode.ThemeIcon.Folder;
    return treeItem;
  }

  public getParent(item: DirectoryNode): DirectoryNode | undefined {
    return item.parent;
  }

  public getOutput(items: readonly DirectoryNode[]): PaneOutput {
    return {
      uris: items.map((d) => d.uri),
      items: Array.from(items),
    };
  }

  public async configureFilter(config: DirectoriesPaneConfig): Promise<boolean> {
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
