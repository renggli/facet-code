/** biome-ignore-all lint/suspicious/noExplicitAny: mocking code */
import Module from 'node:module';

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(start: Position, end: Position);
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    if (typeof a === 'number') {
      this.start = new Position(a, b as number);
      this.end = new Position(c as number, d as number);
    } else {
      this.start = a;
      this.end = b as Position;
    }
  }
  contains(posOrRange?: Position | Range): boolean {
    if (!posOrRange) {
      return false;
    }
    const pos = 'line' in posOrRange ? posOrRange : posOrRange.start;
    if (!pos) {
      return false;
    }
    if (pos.line < this.start.line || pos.line > this.end.line) {
      return false;
    }
    if (pos.line === this.start.line && pos.character < this.start.character) {
      return false;
    }
    if (pos.line === this.end.line && pos.character > this.end.character) {
      return false;
    }
    return true;
  }
  isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }
}

export class Selection extends Range {
  readonly anchor: Position;
  readonly active: Position;
  constructor(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number);
  constructor(anchor: Position, active: Position);
  constructor(a: number | Position, b: number | Position, c?: number, d?: number) {
    super(a as any, b as any, c as any, d as any);
    if (typeof a === 'number') {
      this.anchor = new Position(a, b as number);
      this.active = new Position(c as number, d as number);
    } else {
      this.anchor = a;
      this.active = b as Position;
    }
  }
}

export class Uri {
  static file(fsPath: string): Uri {
    return new Uri('file', fsPath, fsPath);
  }
  static parse(val: string): Uri {
    return new Uri('file', val, val);
  }
  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const rawBase = (base.fsPath || base.path || '').replace(/\\/g, '/');
    const isRoot = rawBase === '/';
    const cleanBase = isRoot ? '' : rawBase.replace(/\/+$/, '');
    const cleanSegments = pathSegments
      .map((s) => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter((s) => s.length > 0);
    const joined =
      cleanBase === '' && cleanSegments.length > 0
        ? `/${cleanSegments.join('/')}`
        : [cleanBase, ...cleanSegments].join('/');
    return new Uri(base.scheme ?? 'file', joined || '/', joined || '/');
  }
  constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    public readonly path: string,
  ) {}
  toString(): string {
    return this.fsPath;
  }
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export class TreeItem {
  description?: string;
  iconPath?: any;
  command?: any;
  resourceUri?: Uri;
  contextValue?: string;
  tooltip?: string;
  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {}
}

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class EventEmitter<T> {
  private listeners: ((e: T) => any)[] = [];
  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };
  fire(data: T): void {
    for (const l of this.listeners) {
      l(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}

export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {}
}

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

type QuickPickResponder = ((items: any, options?: any) => any) | any;
type InputBoxResponder = ((options?: any) => any) | any;

const quickPickQueue: QuickPickResponder[] = [];
const inputBoxQueue: InputBoxResponder[] = [];
const registeredCommands = new Map<string, (...args: any[]) => any>();
const extensionRegistry = new Map<string, any>();

export class RelativePattern {
  constructor(
    public base: any,
    public pattern: string,
  ) {}
}

const mockConfigStore = new Map<string, any>();

export function clearMockConfig(): void {
  mockConfigStore.clear();
}

export function resetMockState(): void {
  clearMockConfig();
  window.clearPromptQueues();
  commands.clearHandlers();
  extensions.clearExtensions();
  workspace.textDocuments = [];
  workspace.workspaceFolders = undefined;
  window.activeTextEditor = undefined;
  window.tabGroups = undefined;
}

export const workspace = {
  textDocuments: [] as any[],
  workspaceFolders: undefined as any[] | undefined,
  asRelativePath(uriOrPath: any): string {
    const raw = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path || uriOrPath.fsPath || '';
    const norm = raw.replace(/\\/g, '/');
    if (norm.startsWith('/workspace/')) {
      return norm.slice('/workspace/'.length);
    }
    if (norm.startsWith('workspace/')) {
      return norm.slice('workspace/'.length);
    }
    return raw;
  },
  findFiles: async (_include?: any, _exclude?: any): Promise<any[]> => [],
  openTextDocument: async (uri: any) => ({
    uri,
    version: 1,
    getText: () => '',
  }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidCreateFiles: () => ({ dispose: () => {} }),
  onDidDeleteFiles: () => ({ dispose: () => {} }),
  onDidRenameFiles: () => ({ dispose: () => {} }),
  fs: {
    readFile: async () => Buffer.from('', 'utf8'),
    writeFile: async () => {},
    createDirectory: async () => {},
    delete: async () => {},
    rename: async () => {},
  },
  getConfiguration: (section?: string) => {
    return {
      get: (key: string, defaultValue?: any) => {
        const full = section ? `${section}.${key}` : key;
        return mockConfigStore.has(full) ? mockConfigStore.get(full) : defaultValue;
      },
      update: async (key: string, value: any, _target?: any) => {
        const full = section ? `${section}.${key}` : key;
        mockConfigStore.set(full, value);
      },
    };
  },
};

export const window = {
  activeTextEditor: undefined as any,
  tabGroups: undefined as { all: any[] } | undefined,
  showTextDocument: async (docOrUri: any) => ({
    document: docOrUri,
    revealRange: () => {},
    selection: new Selection(0, 0, 0, 0),
  }),
  showQuickPick: async (items: any, options?: any) => {
    if (quickPickQueue.length > 0) {
      const responder = quickPickQueue.shift();
      if (typeof responder === 'function') {
        return responder(items, options);
      }
      return responder;
    }
    return undefined;
  },
  showInputBox: async (options?: any) => {
    if (inputBoxQueue.length > 0) {
      const responder = inputBoxQueue.shift();
      if (typeof responder === 'function') {
        return responder(options);
      }
      return responder;
    }
    return undefined;
  },
  pushQuickPick: (responder: QuickPickResponder) => {
    quickPickQueue.push(responder);
  },
  pushInputBox: (responder: InputBoxResponder) => {
    inputBoxQueue.push(responder);
  },
  clearPromptQueues: () => {
    quickPickQueue.length = 0;
    inputBoxQueue.length = 0;
  },
  createTreeView: () => ({
    title: '',
    description: '',
    visible: true,
    onDidChangeSelection: () => ({ dispose: () => {} }),
    onDidChangeVisibility: () => ({ dispose: () => {} }),
    reveal: async () => {},
    dispose: () => {},
  }),
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
  onDidChangeWindowState: () => ({ dispose: () => {} }),
  showWarningMessage: async (_message?: string, ..._items: any[]) => undefined as any,
  showInformationMessage: async (_message?: string, ..._items: any[]) => undefined as any,
};

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export const languages = {
  getDiagnostics: (_uri?: any): any[] => [],
  onDidChangeDiagnostics: () => ({ dispose: () => {} }),
};

export const env = {
  clipboard: {
    writeText: async (_text: string) => {},
    readText: async () => '',
  },
};

export const commands = {
  executeCommand: async (command: string, ...args: any[]) => {
    const handler = registeredCommands.get(command);
    if (handler) {
      return handler(...args);
    }
    return undefined;
  },
  registerCommand: (command: string, handler: (...args: any[]) => any) => {
    registeredCommands.set(command, handler);
    return {
      dispose: () => {
        registeredCommands.delete(command);
      },
    };
  },
  setHandler: (command: string, handler: (...args: any[]) => any) => {
    registeredCommands.set(command, handler);
  },
  clearHandlers: () => {
    registeredCommands.clear();
  },
};

export const extensions = {
  getExtension: (id: string): any => extensionRegistry.get(id),
  registerExtension: (id: string, extension: any) => {
    extensionRegistry.set(id, extension);
  },
  clearExtensions: () => {
    extensionRegistry.clear();
  },
};

export const mockVscode = {
  Position,
  Range,
  Selection,
  Uri,
  ViewColumn,
  TextEditorRevealType,
  SymbolKind,
  DiagnosticSeverity,
  ConfigurationTarget,
  QuickPickItemKind,
  ExtensionMode,
  TreeItemCollapsibleState,
  TreeItem,
  ThemeIcon,
  EventEmitter,
  CancellationTokenSource,
  RelativePattern,
  workspace,
  window,
  languages,
  env,
  commands,
  extensions,
  resetMockState,
};

const origRequire = Module.prototype.require;
Module.prototype.require = function (this: any, id: string, ...args: any[]) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return origRequire.apply(this, [id, ...args] as any);
};
