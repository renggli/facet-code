import * as vscode from 'vscode';

export enum MemberCategory {
  All = 'all',
  Constants = 'constants',
  Fields = 'fields',
  Constructors = 'constructors',
  InstanceMethods = 'instanceMethods',
  StaticMethods = 'staticMethods',
  Accessors = 'accessors',
  Special = 'special'
}

export type HierarchyMode = 'flat' | 'inherited';
export type LayoutMode = 'tree' | 'list';

export interface FacetSymbolNode {
  name: string;
  detail?: string;
  kind: vscode.SymbolKind;
  uri: vscode.Uri;
  range: vscode.Range;
  selectionRange: vscode.Range;
  category: MemberCategory;
  isStatic: boolean;
  children: FacetSymbolNode[];
  parent?: FacetSymbolNode;
}

export function isTypeKind(kind: vscode.SymbolKind): boolean {
  return (
    kind === vscode.SymbolKind.Class ||
    kind === vscode.SymbolKind.Interface ||
    kind === vscode.SymbolKind.Enum ||
    kind === vscode.SymbolKind.Struct
  );
}

export function filterMembers(
  members: readonly FacetSymbolNode[],
  category: MemberCategory = MemberCategory.All
): FacetSymbolNode[] {
  return members.filter((m) => {
    if (category !== MemberCategory.All && m.category !== category) {
      return false;
    }
    return true;
  });
}

export function unionMembers(types: readonly FacetSymbolNode[]): FacetSymbolNode[] {
  const result: FacetSymbolNode[] = [];
  const seen = new Set<string>();

  for (const t of types) {
    for (const member of t.children) {
      const key = `${member.name}:${member.kind}:${member.isStatic}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(member);
      }
    }
  }
  return result;
}

export function getSymbolIcon(kind: vscode.SymbolKind): vscode.ThemeIcon {
  switch (kind) {
    case vscode.SymbolKind.Class:
      return new vscode.ThemeIcon('symbol-class');
    case vscode.SymbolKind.Interface:
      return new vscode.ThemeIcon('symbol-interface');
    case vscode.SymbolKind.Enum:
      return new vscode.ThemeIcon('symbol-enum');
    case vscode.SymbolKind.Struct:
      return new vscode.ThemeIcon('symbol-struct');
    case vscode.SymbolKind.Function:
      return new vscode.ThemeIcon('symbol-function');
    case vscode.SymbolKind.Method:
      return new vscode.ThemeIcon('symbol-method');
    case vscode.SymbolKind.Constructor:
      return new vscode.ThemeIcon('symbol-constructor');
    case vscode.SymbolKind.Field:
      return new vscode.ThemeIcon('symbol-field');
    case vscode.SymbolKind.Property:
      return new vscode.ThemeIcon('symbol-property');
    case vscode.SymbolKind.Variable:
      return new vscode.ThemeIcon('symbol-variable');
    case vscode.SymbolKind.Constant:
      return new vscode.ThemeIcon('symbol-constant');
    default:
      return new vscode.ThemeIcon('symbol-misc');
  }
}
