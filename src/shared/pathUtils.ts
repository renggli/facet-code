import * as vscode from 'vscode';

/**
 * Returns the file or directory name from a given URI or path string.
 */
export function getPathBasename(uriOrPath: vscode.Uri | string): string {
  const pathStr = typeof uriOrPath === 'string' ? uriOrPath : (uriOrPath?.path ?? '');
  const normalized = pathStr.replace(/\\/g, '/');
  if (normalized === '') {
    return '';
  }
  if (/^\/+$/.test(normalized)) {
    return '/';
  }
  const trimmed = normalized.replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  if (lastSlash === -1) {
    return trimmed;
  }
  const basename = trimmed.slice(lastSlash + 1);
  return (basename !== '' ? basename : undefined) ?? trimmed;
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
