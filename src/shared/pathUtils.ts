import * as vscode from 'vscode';

/**
 * Returns the file or directory name from a given URI or path string.
 */
export function getPathBasename(uriOrPath: vscode.Uri | string): string {
  const pathStr = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path;
  const normalized = pathStr.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) {
    return normalized;
  }
  return normalized.slice(lastSlash + 1) || normalized;
}

/**
 * Normalizes relative workspace path for a URI, falling back to fsPath or path.
 */
export function getRelativePath(uri: vscode.Uri): string {
  try {
    if (vscode.workspace.asRelativePath) {
      const rel = vscode.workspace.asRelativePath(uri);
      return rel ? rel.replace(/\\/g, '/') : uri.fsPath.replace(/\\/g, '/');
    }
  } catch {
    // fallback
  }
  return (uri.fsPath ?? uri.path ?? '').replace(/\\/g, '/');
}

/**
 * Returns parent directory path if present from relative path.
 */
export function getParentDirectoryPath(relativePath: string): string | undefined {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash !== -1 ? normalized.slice(0, lastSlash) : undefined;
}
