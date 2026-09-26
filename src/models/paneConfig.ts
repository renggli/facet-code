import * as vscode from 'vscode';
import { FacetSymbolNode } from './symbolNode';

export type PaneRole =
  | 'files'
  | 'types'
  | 'members'
  | 'references'
  | 'implementations'
  | 'callers'
  | 'hierarchy';

export type PaneInputSource = 'global' | 'file' | 'pane';
export type SelectionSource = 'none' | 'all' | 'cursor';
export type SortOption = 'alphabetical' | 'fileOrder' | 'grouped';
export type DisplayMode = 'flat' | 'hierarchy';

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
  { key: 'variable', label: 'Variable', kind: vscode.SymbolKind.Variable }
];

export const TYPE_FILTER_KEYS: SymbolKindKey[] = [
  'class',
  'interface',
  'struct',
  'enum',
  'module',
  'namespace'
];

export const MEMBER_FILTER_KEYS: SymbolKindKey[] = [
  'method',
  'field',
  'property',
  'constructor',
  'constant',
  'variable',
  'function',
  'enumMember',
  'event',
  'operator'
];

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
  [vscode.SymbolKind.TypeParameter]: 'typeParameter'
};

export type PaneFilters = {
  [K in SymbolKindKey]?: boolean;
};

export interface BasePaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  visible: boolean;
  inputPaneId?: string;
}

export interface FilesPaneConfig extends BasePaneConfig {
  role: 'files';
  inputSource: 'global' | 'file' | 'pane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder';
  filePattern?: string;
}

export interface TypesPaneConfig extends BasePaneConfig {
  role: 'types';
  inputSource: 'global' | 'file' | 'pane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder' | 'grouped';
  display: 'flat' | 'hierarchy';
  subclassTypes?: SymbolKindKey[];
  filters: PaneFilters;
}

export interface MembersPaneConfig extends BasePaneConfig {
  role: 'members';
  inputSource: 'global' | 'file' | 'pane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder' | 'grouped';
  display: 'flat' | 'hierarchy';
  filters: PaneFilters;
}

export interface ReferencesPaneConfig extends BasePaneConfig {
  role: 'references';
  inputSource: 'file' | 'pane';
  selectionSource: 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder';
}

export interface ImplementationsPaneConfig extends BasePaneConfig {
  role: 'implementations';
  inputSource: 'file' | 'pane';
  selectionSource: 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder';
}

export interface CallersPaneConfig extends BasePaneConfig {
  role: 'callers';
  inputSource: 'file' | 'pane';
  selectionSource: 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder';
}

export interface HierarchyPaneConfig extends BasePaneConfig {
  role: 'hierarchy';
  inputSource: 'global' | 'file' | 'pane';
  selectionSource: 'cursor' | 'all' | 'none';
  sort: 'alphabetical' | 'fileOrder' | 'grouped';
  display: 'hierarchy';
  subclassTypes?: SymbolKindKey[];
  filters: PaneFilters;
}

export type PaneConfig =
  | FilesPaneConfig
  | TypesPaneConfig
  | MembersPaneConfig
  | ReferencesPaneConfig
  | ImplementationsPaneConfig
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

export function matchesPaneFilters(node: FacetSymbolNode, filters?: PaneFilters): boolean {
  if (!filters) {
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
    inputSource: 'global',
    selectionSource: 'none',
    sort: 'alphabetical',
    visible: true,
    ...overrides
  };
}

export function createTypesPane(id: string, overrides?: Partial<TypesPaneConfig>): TypesPaneConfig {
  return {
    id,
    title: 'Types',
    role: 'types',
    inputSource: 'global',
    selectionSource: 'cursor',
    sort: 'alphabetical',
    display: 'hierarchy',
    subclassTypes: ['class', 'struct'],
    filters: createDefaultFilters(TYPE_FILTER_KEYS),
    visible: true,
    ...overrides
  };
}

export function createMembersPane(id: string, overrides?: Partial<MembersPaneConfig>): MembersPaneConfig {
  return {
    id,
    title: 'Members',
    role: 'members',
    inputSource: 'pane',
    selectionSource: 'none',
    sort: 'alphabetical',
    display: 'flat',
    filters: createDefaultFilters(MEMBER_FILTER_KEYS),
    visible: true,
    ...overrides
  };
}

export function createReferencesPane(
  id: string,
  overrides?: Partial<ReferencesPaneConfig>
): ReferencesPaneConfig {
  return {
    id,
    title: 'References',
    role: 'references',
    inputSource: 'pane',
    selectionSource: 'none',
    sort: 'alphabetical',
    visible: true,
    ...overrides
  };
}

export function createImplementationsPane(
  id: string,
  overrides?: Partial<ImplementationsPaneConfig>
): ImplementationsPaneConfig {
  return {
    id,
    title: 'Implementations',
    role: 'implementations',
    inputSource: 'pane',
    selectionSource: 'none',
    sort: 'alphabetical',
    visible: true,
    ...overrides
  };
}

export function createCallersPane(id: string, overrides?: Partial<CallersPaneConfig>): CallersPaneConfig {
  return {
    id,
    title: 'Callers',
    role: 'callers',
    inputSource: 'pane',
    selectionSource: 'none',
    sort: 'alphabetical',
    visible: true,
    ...overrides
  };
}

export function createHierarchyPane(
  id: string,
  overrides?: Partial<HierarchyPaneConfig>
): HierarchyPaneConfig {
  return {
    id,
    title: 'Hierarchy',
    role: 'hierarchy',
    inputSource: 'pane',
    selectionSource: 'cursor',
    sort: 'alphabetical',
    display: 'hierarchy',
    subclassTypes: ['class', 'struct'],
    filters: createDefaultFilters(TYPE_FILTER_KEYS),
    visible: true,
    ...overrides
  };
}

export function createPaneByRole(role: PaneRole, id: string, overrides?: Partial<any>): PaneConfig {
  switch (role) {
    case 'files':
      return createFilesPane(id, overrides);
    case 'types':
      return createTypesPane(id, overrides);
    case 'members':
      return createMembersPane(id, overrides);
    case 'references':
      return createReferencesPane(id, overrides);
    case 'implementations':
      return createImplementationsPane(id, overrides);
    case 'callers':
      return createCallersPane(id, overrides);
    case 'hierarchy':
      return createHierarchyPane(id, overrides);
  }
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    createTypesPane('facet.pane.1', { visible: true }),
    createMembersPane('facet.pane.2', { visible: true }),
    createReferencesPane('facet.pane.3', { visible: true }),
    createImplementationsPane('facet.pane.4', { visible: false }),
    createCallersPane('facet.pane.5', { visible: false }),
    createHierarchyPane('facet.pane.6', { visible: false })
  ];
}
