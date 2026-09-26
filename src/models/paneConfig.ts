import * as vscode from 'vscode';
import { FacetSymbolNode } from './symbolNode';

export type PaneRole = 'types' | 'members' | 'references' | 'implementations' | 'callers' | 'hierarchy';
export type PaneInputSource = 'project' | 'cursor' | 'previous' | 'file';
export type DisplayMode = 'flat' | 'hierarchy';

export interface PaneFilters {
  classes?: boolean;
  interfaces?: boolean;
  enums?: boolean;
  structs?: boolean;
  functions?: boolean;
  methods?: boolean;
  constructors?: boolean;
  fields?: boolean;
  properties?: boolean;
  variables?: boolean;
  constants?: boolean;
}

export interface PaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  role: PaneRole;
  inputSource: PaneInputSource;
  followSelection: boolean;
  followCursor: boolean;
  showIcons: boolean;
  showContext: boolean;
  filters: PaneFilters;
  display: DisplayMode;
  visible: boolean;
}

export function createDefaultFilters(): PaneFilters {
  return {
    classes: true,
    interfaces: true,
    enums: true,
    structs: true,
    functions: true,
    methods: true,
    constructors: true,
    fields: true,
    properties: true,
    variables: true,
    constants: true
  };
}

export function matchesPaneFilters(node: FacetSymbolNode, filters: PaneFilters): boolean {
  switch (node.kind) {
    case vscode.SymbolKind.Class:
      return filters.classes !== false;
    case vscode.SymbolKind.Interface:
      return filters.interfaces !== false;
    case vscode.SymbolKind.Enum:
      return filters.enums !== false;
    case vscode.SymbolKind.Struct:
      return filters.structs !== false;
    case vscode.SymbolKind.Function:
      return filters.functions !== false;
    case vscode.SymbolKind.Method:
      return filters.methods !== false;
    case vscode.SymbolKind.Constructor:
      return filters.constructors !== false;
    case vscode.SymbolKind.Field:
      return filters.fields !== false;
    case vscode.SymbolKind.Property:
      return filters.properties !== false;
    case vscode.SymbolKind.Variable:
      return filters.variables !== false;
    case vscode.SymbolKind.Constant:
      return filters.constants !== false;
    default:
      return true;
  }
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      inputSource: 'project',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: true
    },
    {
      id: 'facet.pane.2',
      title: 'Members',
      role: 'members',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    },
    {
      id: 'facet.pane.3',
      title: 'References',
      role: 'references',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: true
    },
    {
      id: 'facet.pane.4',
      title: 'Implementations',
      role: 'implementations',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: false
    },
    {
      id: 'facet.pane.5',
      title: 'Callers',
      role: 'callers',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'flat',
      visible: false
    },
    {
      id: 'facet.pane.6',
      title: 'Hierarchy',
      role: 'hierarchy',
      inputSource: 'previous',
      followSelection: true,
      followCursor: true,
      showIcons: true,
      showContext: true,
      filters: createDefaultFilters(),
      display: 'hierarchy',
      visible: false
    }
  ];
}
