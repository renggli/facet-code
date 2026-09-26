import * as vscode from 'vscode';
import { FacetSymbolNode } from './symbolNode';

export type PaneRole = 'files' | 'types' | 'members' | 'references' | 'implementations' | 'callers' | 'hierarchy';
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

export interface PaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  role: PaneRole;
  inputSource: PaneInputSource;
  selectionSource: SelectionSource;
  sort: SortOption;
  filters: PaneFilters;
  filePattern?: string;
  display: DisplayMode;
  subclassTypes?: SymbolKindKey[];
  visible: boolean;
}

export function createDefaultFilters(): PaneFilters {
  const filters: Partial<Record<SymbolKindKey, boolean>> = {};
  for (const opt of ALL_SYMBOL_FILTER_OPTIONS) {
    filters[opt.key] = true;
  }
  return filters as PaneFilters;
}

export function matchesPaneFilters(node: FacetSymbolNode, filters: PaneFilters): boolean {
  const key = SYMBOL_KIND_TO_KEY[node.kind];
  if (key && filters[key] === false) {
    return false;
  }
  return true;
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      inputSource: 'global',
      selectionSource: 'cursor',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'hierarchy',
      subclassTypes: ['class', 'struct'],
      visible: true
    },
    {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'pane',
      selectionSource: 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    },
    {
      id: 'facet.pane.3',
      title: 'References',
      role: 'references',
      inputSource: 'pane',
      selectionSource: 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    },
    {
      id: 'facet.pane.4',
      title: 'Implementations',
      role: 'implementations',
      inputSource: 'pane',
      selectionSource: 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: false
    },
    {
      id: 'facet.pane.5',
      title: 'Callers',
      role: 'callers',
      inputSource: 'pane',
      selectionSource: 'none',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'flat',
      visible: false
    },
    {
      id: 'facet.pane.6',
      title: 'Hierarchy',
      role: 'hierarchy',
      inputSource: 'pane',
      selectionSource: 'cursor',
      sort: 'alphabetical',
      filters: createDefaultFilters(),
      display: 'hierarchy',
      subclassTypes: ['class', 'struct'],
      visible: false
    }
  ];
}
