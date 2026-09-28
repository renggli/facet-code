import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
/**
 * Extracts the user-configured visual order of native pane slots (facet.pane.1 .. 6)
 * from VS Code's workbench state storage buffer / string.
 */
export function parseSlotOrderFromBuffer(buffer: Buffer | string): string[] | undefined {
  const text = typeof buffer === 'string' ? buffer : buffer.toString('utf8');
  const orderMap = new Map<string, number>();

  // Pattern 4: Consecutive occurrences or array of facet.pane.X slots (e.g. "facet-container":[...], "views":[...])
  const arrayRegex = /"(?:views|facet-container|defaultViews)"[^[]*\[([^\]]+)\]/g;
  let lastArraySlots: string[] | undefined;
  for (const m of text.matchAll(arrayRegex)) {
    const slotMatches = Array.from(m[1].matchAll(/"(facet\.pane\.[1-6])"/g)).map((sm) => sm[1]);
    const distinct = Array.from(new Set(slotMatches));
    if (distinct.length >= 2) {
      lastArraySlots = distinct;
    }
  }
  if (lastArraySlots) {
    return lastArraySlots;
  }

  // Pattern 1: "facet.pane.X":{..."order":N...}
  const regex1 = /"(facet\.pane\.[1-6])"\s*:\s*\{[^{}]*?"order"\s*:\s*(\d+)/g;
  for (const m of text.matchAll(regex1)) {
    orderMap.set(m[1], parseInt(m[2], 10));
  }

  // Pattern 2: {..."order":N..."id":"facet.pane.X"...}
  if (orderMap.size < 2) {
    const regex2 = /\{[^{}]*?"order"\s*:\s*(\d+)[^{}]*?"(?:id|viewId)"\s*:\s*"(facet\.pane\.[1-6])"/g;
    for (const m of text.matchAll(regex2)) {
      orderMap.set(m[2], parseInt(m[1], 10));
    }
  }

  // Pattern 3: General "facet.pane.X" followed by "order": N within 200 chars
  if (orderMap.size < 2) {
    const regex3 = /"(facet\.pane\.[1-6])"[^}]{0,200}?"order"[:\s]+(\d+)/g;
    for (const m of text.matchAll(regex3)) {
      orderMap.set(m[1], parseInt(m[2], 10));
    }
  }

  if (orderMap.size >= 2) {
    return Array.from(orderMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([slotId]) => slotId);
  }
  return undefined;
}

/**
 * Watches workbench workspace storage to detect drag-and-drop view reordering
 * of Facet pane slots in the VS Code sidebar.
 */
export class WorkbenchLayoutWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private fsWatchers: fs.FSWatcher[] = [];
  private intervalTimer?: NodeJS.Timeout;
  private lastOrderString = '';
  private readonly candidateDirs: string[] = [];

  constructor(
    private readonly storageUri: vscode.Uri | undefined,
    private readonly globalStorageUri: vscode.Uri | undefined,
    private readonly onOrderChanged: (slotOrder: string[]) => void,
  ) {
    this.candidateDirs = this.resolveCandidateDirs();
    this.init();
  }

  public checkOrder(): void {
    if (this.candidateDirs.length === 0) {
      return;
    }
    try {
      let combined = '';
      for (const dir of this.candidateDirs) {
        const stateDbPath = path.join(dir, 'state.vscdb');
        const walPath = path.join(dir, 'state.vscdb-wal');

        if (fs.existsSync?.(stateDbPath)) {
          try {
            combined += fs.readFileSync(stateDbPath, 'utf8');
          } catch {
            // ignore lock
          }
        }
        if (fs.existsSync?.(walPath)) {
          try {
            combined += fs.readFileSync(walPath, 'utf8');
          } catch {
            // ignore lock
          }
        }
      }

      if (!combined) {
        return;
      }

      const order = parseSlotOrderFromBuffer(combined);
      if (order && order.length >= 2) {
        const orderStr = order.join(',');
        if (orderStr !== this.lastOrderString) {
          this.lastOrderString = orderStr;
          this.onOrderChanged(order);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  public dispose(): void {
    this.watcher?.dispose();
    for (const fsw of this.fsWatchers) {
      try {
        fsw.close();
      } catch {
        // ignore
      }
    }
    this.fsWatchers = [];
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }

  // --- Private Helpers at Bottom ---

  private resolveCandidateDirs(): string[] {
    const dirs = new Set<string>();
    if (this.storageUri) {
      dirs.add(path.dirname(this.storageUri.fsPath));
    }
    if (this.globalStorageUri) {
      dirs.add(path.dirname(this.globalStorageUri.fsPath));
      dirs.add(path.join(path.dirname(this.globalStorageUri.fsPath), '..'));
    }
    return Array.from(dirs).filter((d) => {
      try {
        return fs.existsSync?.(d);
      } catch {
        return false;
      }
    });
  }

  private init(): void {
    if (this.candidateDirs.length === 0) {
      return;
    }
    try {
      for (const dir of this.candidateDirs) {
        if (vscode.workspace.createFileSystemWatcher) {
          try {
            const pattern = new vscode.RelativePattern(dir, 'state.vscdb*');
            const w = vscode.workspace.createFileSystemWatcher(pattern);
            w.onDidChange(() => this.checkOrder());
            w.onDidCreate(() => this.checkOrder());
            this.watcher = w;
          } catch {
            // ignore watcher errors
          }
        }

        if (fs.watch) {
          try {
            const fsw = fs.watch(dir, (_event, filename) => {
              if (filename?.startsWith('state.vscdb')) {
                this.checkOrder();
              }
            });
            if (fsw.unref) {
              fsw.unref();
            }
            this.fsWatchers.push(fsw);
          } catch {
            // ignore fs.watch failure
          }
        }
      }

      this.intervalTimer = setInterval(() => this.checkOrder(), 1500);
      if (this.intervalTimer.unref) {
        this.intervalTimer.unref();
      }
      this.checkOrder();
    } catch {
      // Graceful fallback if storage cannot be watched
    }
  }
}
