import * as vscode from 'vscode';

export enum PaneRole {
  Files = 'files',
  Directories = 'directories',
  Symbols = 'symbols',
  Definitions = 'definitions',
  Declarations = 'declarations',
  Implementations = 'implementations',
  References = 'references',
  Problems = 'problems',
  Changes = 'changes',
  Callers = 'callers',
  Hierarchy = 'hierarchy',
}

export enum PaneInputSource {
  Project = 'project',
  OpenEditors = 'openEditors',
  ActiveEditor = 'activeEditor',
  PreviousPane = 'previousPane',
}

export enum SortOption {
  Position = 'position',
  Name = 'name',
  Category = 'category',
}

export enum RelationMode {
  References = 'references',
  Callers = 'callers',
  Implementations = 'implementations',
  Definitions = 'definitions',
  Declarations = 'declarations',
}

export enum SymbolKindKey {
  Array = 'array',
  Boolean = 'boolean',
  Class = 'class',
  Constant = 'constant',
  Constructor = 'constructor',
  EnumMember = 'enumMember',
  Enum = 'enum',
  Event = 'event',
  Field = 'field',
  File = 'file',
  Function = 'function',
  Interface = 'interface',
  Key = 'key',
  Method = 'method',
  Module = 'module',
  Namespace = 'namespace',
  Null = 'null',
  Number = 'number',
  Object = 'object',
  Operator = 'operator',
  Package = 'package',
  Property = 'property',
  String = 'string',
  Struct = 'struct',
  TypeParameter = 'typeParameter',
  Variable = 'variable',
}

export const ALL_SYMBOL_FILTER_OPTIONS: { key: SymbolKindKey; label: string; kind: vscode.SymbolKind }[] = [
  { key: SymbolKindKey.Array, label: 'Array', kind: vscode.SymbolKind.Array },
  { key: SymbolKindKey.Boolean, label: 'Boolean', kind: vscode.SymbolKind.Boolean },
  { key: SymbolKindKey.Class, label: 'Class', kind: vscode.SymbolKind.Class },
  { key: SymbolKindKey.Constant, label: 'Constant', kind: vscode.SymbolKind.Constant },
  { key: SymbolKindKey.Constructor, label: 'Constructor', kind: vscode.SymbolKind.Constructor },
  { key: SymbolKindKey.EnumMember, label: 'Enum Member', kind: vscode.SymbolKind.EnumMember },
  { key: SymbolKindKey.Enum, label: 'Enum', kind: vscode.SymbolKind.Enum },
  { key: SymbolKindKey.Event, label: 'Event', kind: vscode.SymbolKind.Event },
  { key: SymbolKindKey.Field, label: 'Field', kind: vscode.SymbolKind.Field },
  { key: SymbolKindKey.File, label: 'File', kind: vscode.SymbolKind.File },
  { key: SymbolKindKey.Function, label: 'Function', kind: vscode.SymbolKind.Function },
  { key: SymbolKindKey.Interface, label: 'Interface', kind: vscode.SymbolKind.Interface },
  { key: SymbolKindKey.Key, label: 'Key', kind: vscode.SymbolKind.Key },
  { key: SymbolKindKey.Method, label: 'Method', kind: vscode.SymbolKind.Method },
  { key: SymbolKindKey.Module, label: 'Module', kind: vscode.SymbolKind.Module },
  { key: SymbolKindKey.Namespace, label: 'Namespace', kind: vscode.SymbolKind.Namespace },
  { key: SymbolKindKey.Null, label: 'Null', kind: vscode.SymbolKind.Null },
  { key: SymbolKindKey.Number, label: 'Number', kind: vscode.SymbolKind.Number },
  { key: SymbolKindKey.Object, label: 'Object', kind: vscode.SymbolKind.Object },
  { key: SymbolKindKey.Operator, label: 'Operator', kind: vscode.SymbolKind.Operator },
  { key: SymbolKindKey.Package, label: 'Package', kind: vscode.SymbolKind.Package },
  { key: SymbolKindKey.Property, label: 'Property', kind: vscode.SymbolKind.Property },
  { key: SymbolKindKey.String, label: 'String', kind: vscode.SymbolKind.String },
  { key: SymbolKindKey.Struct, label: 'Struct', kind: vscode.SymbolKind.Struct },
  { key: SymbolKindKey.TypeParameter, label: 'Type Parameter', kind: vscode.SymbolKind.TypeParameter },
  { key: SymbolKindKey.Variable, label: 'Variable', kind: vscode.SymbolKind.Variable },
];

export const SYMBOL_KIND_TO_KEY: Record<number, SymbolKindKey> = {
  [vscode.SymbolKind.File]: SymbolKindKey.File,
  [vscode.SymbolKind.Module]: SymbolKindKey.Module,
  [vscode.SymbolKind.Namespace]: SymbolKindKey.Namespace,
  [vscode.SymbolKind.Package]: SymbolKindKey.Package,
  [vscode.SymbolKind.Class]: SymbolKindKey.Class,
  [vscode.SymbolKind.Method]: SymbolKindKey.Method,
  [vscode.SymbolKind.Property]: SymbolKindKey.Property,
  [vscode.SymbolKind.Field]: SymbolKindKey.Field,
  [vscode.SymbolKind.Constructor]: SymbolKindKey.Constructor,
  [vscode.SymbolKind.Enum]: SymbolKindKey.Enum,
  [vscode.SymbolKind.Interface]: SymbolKindKey.Interface,
  [vscode.SymbolKind.Function]: SymbolKindKey.Function,
  [vscode.SymbolKind.Variable]: SymbolKindKey.Variable,
  [vscode.SymbolKind.Constant]: SymbolKindKey.Constant,
  [vscode.SymbolKind.String]: SymbolKindKey.String,
  [vscode.SymbolKind.Number]: SymbolKindKey.Number,
  [vscode.SymbolKind.Boolean]: SymbolKindKey.Boolean,
  [vscode.SymbolKind.Array]: SymbolKindKey.Array,
  [vscode.SymbolKind.Object]: SymbolKindKey.Object,
  [vscode.SymbolKind.Key]: SymbolKindKey.Key,
  [vscode.SymbolKind.Null]: SymbolKindKey.Null,
  [vscode.SymbolKind.EnumMember]: SymbolKindKey.EnumMember,
  [vscode.SymbolKind.Struct]: SymbolKindKey.Struct,
  [vscode.SymbolKind.Event]: SymbolKindKey.Event,
  [vscode.SymbolKind.Operator]: SymbolKindKey.Operator,
  [vscode.SymbolKind.TypeParameter]: SymbolKindKey.TypeParameter,
};

export type PaneFilters = { [key: string]: boolean | undefined };

export interface BasePaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  visible: boolean;
  inputSource: PaneInputSource;
  sort: SortOption;
  pinned?: boolean;
  pinnedUri?: string;
}

export interface FilesPaneConfig extends BasePaneConfig {
  role: PaneRole.Files;
  sort: SortOption.Position | SortOption.Name;
  tree: boolean;
  globPattern?: string;
}

export interface DirectoriesPaneConfig extends BasePaneConfig {
  role: PaneRole.Directories;
  sort: SortOption.Position | SortOption.Name;
  tree: boolean;
  globPattern?: string;
}

export interface DefinitionsPaneConfig extends BasePaneConfig {
  role: PaneRole.Definitions;
  inputSource: PaneInputSource.PreviousPane;
  sort: SortOption.Position | SortOption.Name;
  filters: PaneFilters;
}

export interface DeclarationsPaneConfig extends BasePaneConfig {
  role: PaneRole.Declarations;
  inputSource: PaneInputSource.PreviousPane;
  sort: SortOption.Position | SortOption.Name;
  filters: PaneFilters;
}

export interface ImplementationsPaneConfig extends BasePaneConfig {
  role: PaneRole.Implementations;
  inputSource: PaneInputSource.PreviousPane;
  sort: SortOption.Position | SortOption.Name;
  filters: PaneFilters;
}

export interface ReferencesPaneConfig extends BasePaneConfig {
  role: PaneRole.References;
  inputSource: PaneInputSource.PreviousPane;
  sort: SortOption.Position | SortOption.Name;
  filters: PaneFilters;
}

export interface CallersPaneConfig extends BasePaneConfig {
  role: PaneRole.Callers;
  inputSource: PaneInputSource.PreviousPane;
  sort: SortOption.Position | SortOption.Name;
}

export interface ProblemsPaneConfig extends BasePaneConfig {
  role: PaneRole.Problems;
  sort: SortOption;
}

export interface ChangesPaneConfig extends BasePaneConfig {
  role: PaneRole.Changes;
  sort: SortOption.Position | SortOption.Name;
}

export interface HierarchyPaneConfig extends BasePaneConfig {
  role: PaneRole.Hierarchy;
  sort: SortOption;
  tree: boolean;
  subclassTypes?: SymbolKindKey[];
  filters: PaneFilters;
}

export interface SymbolsPaneConfig extends BasePaneConfig {
  role: PaneRole.Symbols;
  sort: SortOption;
  tree: boolean;
  filters: PaneFilters;
}

export type PaneConfig =
  | FilesPaneConfig
  | DirectoriesPaneConfig
  | SymbolsPaneConfig
  | DefinitionsPaneConfig
  | DeclarationsPaneConfig
  | ImplementationsPaneConfig
  | ReferencesPaneConfig
  | ProblemsPaneConfig
  | ChangesPaneConfig
  | CallersPaneConfig
  | HierarchyPaneConfig;

export type PaneConfigWithTree = FilesPaneConfig | DirectoriesPaneConfig | SymbolsPaneConfig | HierarchyPaneConfig;

export function hasTreeProperty(pane: PaneConfig): pane is PaneConfigWithTree {
  return 'tree' in pane;
}

export function createDefaultFilters(keys?: SymbolKindKey[]): PaneFilters {
  const filters: Partial<Record<SymbolKindKey, boolean>> = {};
  const targetKeys = keys ?? ALL_SYMBOL_FILTER_OPTIONS.map((o) => o.key);
  for (const k of targetKeys) {
    filters[k] = true;
  }
  return filters as PaneFilters;
}

export function matchesPaneFilters(node: { kind?: vscode.SymbolKind }, filters?: PaneFilters): boolean {
  if (!filters || node.kind === undefined) {
    return true;
  }
  const key = SYMBOL_KIND_TO_KEY[node.kind];
  if (key && filters[key] === false) {
    return false;
  }
  return true;
}

export function createFilesPane(id: string, overrides?: Partial<FilesPaneConfig>): FilesPaneConfig {
  return {
    id,
    title: 'Files',
    role: PaneRole.Files,
    inputSource: PaneInputSource.Project,
    sort: SortOption.Name,
    tree: false,
    visible: true,
    pinned: false,
    ...overrides,
  };
}

export function createDirectoriesPane(id: string, overrides?: Partial<DirectoriesPaneConfig>): DirectoriesPaneConfig {
  return {
    id,
    title: 'Directories',
    role: PaneRole.Directories,
    inputSource: PaneInputSource.Project,
    sort: SortOption.Name,
    tree: true,
    visible: true,
    pinned: false,
    ...overrides,
  };
}

export function createSymbolsPane(id: string, overrides?: Partial<SymbolsPaneConfig>): SymbolsPaneConfig {
  return {
    id,
    title: 'Symbols',
    role: PaneRole.Symbols,
    inputSource: PaneInputSource.PreviousPane,
    sort: SortOption.Name,
    tree: true,
    filters: createDefaultFilters(),
    visible: true,
    pinned: false,
    ...overrides,
  };
}

export function createReferencesPane(id: string, overrides?: Partial<ReferencesPaneConfig>): ReferencesPaneConfig {
  return {
    id,
    title: 'References',
    role: PaneRole.References,
    inputSource: PaneInputSource.PreviousPane,
    sort: SortOption.Name,
    filters: createDefaultFilters(),
    visible: true,
    pinned: false,
    ...overrides,
  };
}

export function createImplementationsPane(
  id: string,
  overrides?: Partial<ImplementationsPaneConfig>,
): ImplementationsPaneConfig {
  return {
    id,
    title: 'Implementations',
    role: PaneRole.Implementations,
    inputSource: PaneInputSource.PreviousPane,
    sort: SortOption.Name,
    filters: createDefaultFilters(),
    visible: true,
    pinned: false,
    ...overrides,
  };
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    createDirectoriesPane('facet.pane.1', {
      visible: true,
      tree: true,
      inputSource: PaneInputSource.Project,
      sort: SortOption.Name,
    }),
    createFilesPane('facet.pane.2', {
      visible: true,
      tree: false,
      inputSource: PaneInputSource.PreviousPane,
      sort: SortOption.Name,
    }),
    createSymbolsPane('facet.pane.3', {
      visible: true,
      title: 'Definitions',
      tree: false,
      inputSource: PaneInputSource.PreviousPane,
      sort: SortOption.Category,
    }),
    createSymbolsPane('facet.pane.4', {
      visible: true,
      title: 'Members',
      tree: true,
      inputSource: PaneInputSource.PreviousPane,
      sort: SortOption.Category,
    }),
    createReferencesPane('facet.pane.5', {
      visible: false,
      inputSource: PaneInputSource.PreviousPane,
    }),
    createImplementationsPane('facet.pane.6', {
      visible: false,
      inputSource: PaneInputSource.PreviousPane,
    }),
  ];
}

export function matchesGlob(path: string, pattern?: string): boolean {
  if (!pattern?.trim()) {
    return true;
  }
  const trimmed = pattern.trim();
  const normalizedPath = path.replace(/\\/g, '/');

  // If pattern looks like a regexp: e.g. /foo/i
  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    try {
      const lastSlash = trimmed.lastIndexOf('/');
      const body = trimmed.slice(1, lastSlash);
      const flags = trimmed.slice(lastSlash + 1);
      const re = new RegExp(body, flags ? flags : 'i');
      return re.test(normalizedPath);
    } catch {
      // Fall through to glob matching
    }
  }

  // Convert glob pattern to regular expression
  let isNegated = false;
  let glob = trimmed;
  if (glob.startsWith('!')) {
    isNegated = true;
    glob = glob.slice(1);
  }

  let regexStr = '';
  let inGroup = false;

  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          regexStr += '(?:.+/)?';
        } else {
          regexStr += '.*';
        }
      } else {
        regexStr += '[^/]*';
      }
    } else if (c === '?') {
      regexStr += '[^/]';
    } else if (c === '{') {
      inGroup = true;
      regexStr += '(';
    } else if (c === '}') {
      inGroup = false;
      regexStr += ')';
    } else if (c === ',' && inGroup) {
      regexStr += '|';
    } else if (['.', '(', ')', '+', '^', '$', '[', ']', '|'].includes(c)) {
      regexStr += `\\${c}`;
    } else {
      regexStr += c;
    }
  }

  // If glob has no slashes, match against either full path or basename
  if (!glob.includes('/')) {
    regexStr = `(?:^|.*/)${regexStr}$`;
  } else {
    regexStr = `^${regexStr}$`;
  }

  try {
    const re = new RegExp(regexStr, 'i');
    const matched = re.test(normalizedPath);
    return isNegated ? !matched : matched;
  } catch {
    const matched = normalizedPath.toLowerCase().includes(glob.toLowerCase());
    return isNegated ? !matched : matched;
  }
}
