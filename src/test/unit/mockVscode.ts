const Module = require('module');

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
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
  contains(posOrRange: Position | Range): boolean {
    const pos = 'line' in posOrRange ? posOrRange : posOrRange.start;
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

export class Selection extends Range {}

export class Uri {
  static file(fsPath: string): Uri {
    return new Uri('file', fsPath, fsPath);
  }
  static parse(val: string): Uri {
    return new Uri('file', val, val);
  }
  constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    public readonly path: string
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
  TypeParameter = 25
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class TreeItem {
  description?: string;
  iconPath?: any;
  command?: any;
  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None
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
      }
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
    onCancellationRequested: () => ({ dispose: () => {} })
  };
  cancel(): void {
    this.token.isCancellationRequested = true;
  }
  dispose(): void {}
}

export const workspace = {
  textDocuments: [],
  asRelativePath(uriOrPath: any): string {
    return typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.path || uriOrPath.fsPath;
  },
  findFiles: async () => [],
  openTextDocument: async (uri: any) => ({
    uri,
    version: 1,
    getText: () => ''
  }),
  fs: {
    readFile: async () => Buffer.from('', 'utf8')
  }
};

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3
}

export const window = {
  activeTextEditor: undefined,
  showTextDocument: async () => ({
    revealRange: () => {},
    selection: new Selection(0, 0, 0, 0)
  }),
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  createTreeView: () => ({
    title: '',
    onDidChangeSelection: () => ({ dispose: () => {} }),
    reveal: async () => {},
    dispose: () => {}
  }),
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  onDidChangeTextEditorSelection: () => ({ dispose: () => {} })
};

export const commands = {
  executeCommand: async () => undefined,
  registerCommand: () => ({ dispose: () => {} })
};

export const mockVscode = {
  Position,
  Range,
  Selection,
  Uri,
  SymbolKind,
  ExtensionMode,
  TreeItemCollapsibleState,
  TreeItem,
  ThemeIcon,
  EventEmitter,
  CancellationTokenSource,
  workspace,
  window,
  commands
};

const origRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return origRequire.apply(this, arguments);
};
