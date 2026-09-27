import * as vscode from 'vscode';

export type PaneRole =
  | 'files'
  | 'directories'
  | 'symbols'
  | 'definitions'
  | 'declarations'
  | 'implementations'
  | 'references'
  | 'problems'
  | 'changes'
  | 'callers'
  | 'hierarchy';

export type PaneInputSource = 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
export type SelectionSource = 'none' | 'all' | 'cursor';
export type SortOption = 'position' | 'name' | 'category';

export type SymbolKindKey =
  | 'array'
  | 'boolean'
  | 'class'
  | 'constant'
  | 'constructor'
  | 'enumMember'
  | 'enum'
  | 'event'
  | 'field'
  | 'file'
  | 'function'
  | 'interface'
  | 'key'
  | 'method'
  | 'module'
  | 'namespace'
  | 'null'
  | 'number'
  | 'object'
  | 'operator'
  | 'package'
  | 'property'
  | 'string'
  | 'struct'
  | 'typeParameter'
  | 'variable';

export const ALL_SYMBOL_FILTER_OPTIONS: { key: SymbolKindKey; label: string; kind: vscode.SymbolKind }[] = [
  { key: 'array', label: 'Array', kind: vscode.SymbolKind.Array },
  { key: 'boolean', label: 'Boolean', kind: vscode.SymbolKind.Boolean },
  { key: 'class', label: 'Class', kind: vscode.SymbolKind.Class },
  { key: 'constant', label: 'Constant', kind: vscode.SymbolKind.Constant },
  { key: 'constructor', label: 'Constructor', kind: vscode.SymbolKind.Constructor },
  { key: 'enumMember', label: 'Enum Member', kind: vscode.SymbolKind.EnumMember },
  { key: 'enum', label: 'Enum', kind: vscode.SymbolKind.Enum },
  { key: 'event', label: 'Event', kind: vscode.SymbolKind.Event },
  { key: 'field', label: 'Field', kind: vscode.SymbolKind.Field },
  { key: 'file', label: 'File', kind: vscode.SymbolKind.File },
  { key: 'function', label: 'Function', kind: vscode.SymbolKind.Function },
  { key: 'interface', label: 'Interface', kind: vscode.SymbolKind.Interface },
  { key: 'key', label: 'Key', kind: vscode.SymbolKind.Key },
  { key: 'method', label: 'Method', kind: vscode.SymbolKind.Method },
  { key: 'module', label: 'Module', kind: vscode.SymbolKind.Module },
  { key: 'namespace', label: 'Namespace', kind: vscode.SymbolKind.Namespace },
  { key: 'null', label: 'Null', kind: vscode.SymbolKind.Null },
  { key: 'number', label: 'Number', kind: vscode.SymbolKind.Number },
  { key: 'object', label: 'Object', kind: vscode.SymbolKind.Object },
  { key: 'operator', label: 'Operator', kind: vscode.SymbolKind.Operator },
  { key: 'package', label: 'Package', kind: vscode.SymbolKind.Package },
  { key: 'property', label: 'Property', kind: vscode.SymbolKind.Property },
  { key: 'string', label: 'String', kind: vscode.SymbolKind.String },
  { key: 'struct', label: 'Struct', kind: vscode.SymbolKind.Struct },
  { key: 'typeParameter', label: 'Type Parameter', kind: vscode.SymbolKind.TypeParameter },
  { key: 'variable', label: 'Variable', kind: vscode.SymbolKind.Variable },
];

export const TYPE_FILTER_KEYS: SymbolKindKey[] = ['class', 'interface', 'struct', 'enum', 'module', 'namespace'];

export const SYMBOL_KIND_TO_KEY: Record<number, SymbolKindKey> = {
  [vscode.SymbolKind.File]: 'file',
  [vscode.SymbolKind.Module]: 'module',
  [vscode.SymbolKind.Namespace]: 'namespace',
  [vscode.SymbolKind.Package]: 'package',
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Property]: 'property',
  [vscode.SymbolKind.Field]: 'field',
  [vscode.SymbolKind.Constructor]: 'constructor',
  [vscode.SymbolKind.Enum]: 'enum',
  [vscode.SymbolKind.Interface]: 'interface',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Variable]: 'variable',
  [vscode.SymbolKind.Constant]: 'constant',
  [vscode.SymbolKind.String]: 'string',
  [vscode.SymbolKind.Number]: 'number',
  [vscode.SymbolKind.Boolean]: 'boolean',
  [vscode.SymbolKind.Array]: 'array',
  [vscode.SymbolKind.Object]: 'object',
  [vscode.SymbolKind.Key]: 'key',
  [vscode.SymbolKind.Null]: 'null',
  [vscode.SymbolKind.EnumMember]: 'enumMember',
  [vscode.SymbolKind.Struct]: 'struct',
  [vscode.SymbolKind.Event]: 'event',
  [vscode.SymbolKind.Operator]: 'operator',
  [vscode.SymbolKind.TypeParameter]: 'typeParameter',
};

export type PaneFilters = {
  [K in SymbolKindKey]?: boolean;
};

export interface BasePaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  visible: boolean;
}

export interface FilesPaneConfig extends BasePaneConfig {
  role: 'files';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name';
  tree: boolean;
  globPattern?: string;
}

export interface DirectoriesPaneConfig extends BasePaneConfig {
  role: 'directories';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name';
  tree: boolean;
  globPattern?: string;
}

export interface DefinitionsPaneConfig extends BasePaneConfig {
  role: 'definitions';
  inputSource: 'previousPane';
  selectionSource: 'all' | 'none';
  sort: 'position' | 'name';
  filters: PaneFilters;
}

export interface DeclarationsPaneConfig extends BasePaneConfig {
  role: 'declarations';
  inputSource: 'previousPane';
  selectionSource: 'all' | 'none';
  sort: 'position' | 'name';
  filters: PaneFilters;
}

export interface ImplementationsPaneConfig extends BasePaneConfig {
  role: 'implementations';
  inputSource: 'previousPane';
  selectionSource: 'all' | 'none';
  sort: 'position' | 'name';
  filters: PaneFilters;
}

export interface ReferencesPaneConfig extends BasePaneConfig {
  role: 'references';
  inputSource: 'previousPane';
  selectionSource: 'all' | 'none';
  sort: 'position' | 'name';
  filters: PaneFilters;
}

export interface CallersPaneConfig extends BasePaneConfig {
  role: 'callers';
  inputSource: 'previousPane';
  selectionSource: 'all' | 'none';
  sort: 'position' | 'name';
}

export interface ProblemsPaneConfig extends BasePaneConfig {
  role: 'problems';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name' | 'category';
}

export interface ChangesPaneConfig extends BasePaneConfig {
  role: 'changes';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name';
}

export interface HierarchyPaneConfig extends BasePaneConfig {
  role: 'hierarchy';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name' | 'category';
  tree: boolean;
  subclassTypes?: SymbolKindKey[];
  filters: PaneFilters;
}

export interface SymbolsPaneConfig extends BasePaneConfig {
  role: 'symbols';
  inputSource: 'project' | 'openEditors' | 'activeEditor' | 'previousPane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'position' | 'name' | 'category';
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

export function createDefaultFilters(keys?: SymbolKindKey[]): PaneFilters {
  const filters: Partial<Record<SymbolKindKey, boolean>> = {};
  const targetKeys = keys || ALL_SYMBOL_FILTER_OPTIONS.map((o) => o.key);
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
    role: 'files',
    inputSource: 'project',
    selectionSource: 'none',
    sort: 'name',
    tree: false,
    visible: true,
    ...overrides,
  };
}

export function createDirectoriesPane(id: string, overrides?: Partial<DirectoriesPaneConfig>): DirectoriesPaneConfig {
  return {
    id,
    title: 'Directories',
    role: 'directories',
    inputSource: 'project',
    selectionSource: 'none',
    sort: 'name',
    tree: true,
    visible: true,
    ...overrides,
  };
}

export function createSymbolsPane(id: string, overrides?: Partial<SymbolsPaneConfig>): SymbolsPaneConfig {
  return {
    id,
    title: 'Symbols',
    role: 'symbols',
    inputSource: 'previousPane',
    selectionSource: 'cursor',
    sort: 'name',
    tree: true,
    filters: createDefaultFilters(),
    visible: true,
    ...overrides,
  };
}

export function createReferencesPane(id: string, overrides?: Partial<ReferencesPaneConfig>): ReferencesPaneConfig {
  return {
    id,
    title: 'References',
    role: 'references',
    inputSource: 'previousPane',
    selectionSource: 'none',
    sort: 'name',
    filters: createDefaultFilters(),
    visible: true,
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
    role: 'implementations',
    inputSource: 'previousPane',
    selectionSource: 'none',
    sort: 'name',
    filters: createDefaultFilters(),
    visible: true,
    ...overrides,
  };
}

export function createCallersPane(id: string, overrides?: Partial<CallersPaneConfig>): CallersPaneConfig {
  return {
    id,
    title: 'Callers',
    role: 'callers',
    inputSource: 'previousPane',
    selectionSource: 'none',
    sort: 'name',
    visible: true,
    ...overrides,
  };
}

export function createDefinitionsPane(id: string, overrides?: Partial<DefinitionsPaneConfig>): DefinitionsPaneConfig {
  return {
    id,
    title: 'Definitions',
    role: 'definitions',
    inputSource: 'previousPane',
    selectionSource: 'none',
    sort: 'name',
    filters: createDefaultFilters(),
    visible: true,
    ...overrides,
  };
}

export function createDeclarationsPane(
  id: string,
  overrides?: Partial<DeclarationsPaneConfig>,
): DeclarationsPaneConfig {
  return {
    id,
    title: 'Declarations',
    role: 'declarations',
    inputSource: 'previousPane',
    selectionSource: 'none',
    sort: 'name',
    filters: createDefaultFilters(),
    visible: true,
    ...overrides,
  };
}

export function createProblemsPane(id: string, overrides?: Partial<ProblemsPaneConfig>): ProblemsPaneConfig {
  return {
    id,
    title: 'Problems',
    role: 'problems',
    inputSource: 'project',
    selectionSource: 'none',
    sort: 'position',
    visible: true,
    ...overrides,
  };
}

export function createChangesPane(id: string, overrides?: Partial<ChangesPaneConfig>): ChangesPaneConfig {
  return {
    id,
    title: 'Changes',
    role: 'changes',
    inputSource: 'project',
    selectionSource: 'none',
    sort: 'position',
    visible: true,
    ...overrides,
  };
}

export function createHierarchyPane(id: string, overrides?: Partial<HierarchyPaneConfig>): HierarchyPaneConfig {
  return {
    id,
    title: 'Hierarchy',
    role: 'hierarchy',
    inputSource: 'previousPane',
    selectionSource: 'cursor',
    sort: 'name',
    tree: true,
    subclassTypes: ['class', 'struct'],
    filters: createDefaultFilters(TYPE_FILTER_KEYS),
    visible: true,
    ...overrides,
  };
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    createDirectoriesPane('facet.pane.1', {
      visible: true,
      tree: true,
      inputSource: 'project',
      selectionSource: 'cursor',
    }),
    createFilesPane('facet.pane.2', {
      visible: true,
      tree: false,
      inputSource: 'previousPane',
      selectionSource: 'cursor',
    }),
    createSymbolsPane('facet.pane.3', {
      visible: true,
      title: 'Definitions',
      tree: false,
      inputSource: 'previousPane',
      selectionSource: 'cursor',
    }),
    createSymbolsPane('facet.pane.4', {
      visible: true,
      title: 'Members',
      tree: true,
      inputSource: 'previousPane',
      selectionSource: 'none',
    }),
    createReferencesPane('facet.pane.5', {
      visible: false,
      inputSource: 'previousPane',
      selectionSource: 'none',
    }),
    createImplementationsPane('facet.pane.6', {
      visible: false,
      inputSource: 'previousPane',
      selectionSource: 'none',
    }),
  ];
}

export function matchesGlob(path: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) {
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
      const re = new RegExp(body, flags || 'i');
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
      regexStr += '\\' + c;
    } else {
      regexStr += c;
    }
  }

  // If glob has no slashes, match against either full path or basename
  if (!glob.includes('/')) {
    regexStr = '(?:^|.*/)' + regexStr + '$';
  } else {
    regexStr = '^' + regexStr + '$';
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
