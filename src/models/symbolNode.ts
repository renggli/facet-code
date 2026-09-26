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
  superTypes?: string[];
  subTypes?: FacetSymbolNode[];
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

export function extractTypeHeader(lines: string[], startLine: number): string {
  const collected: string[] = [];
  for (let i = startLine; i < Math.min(startLine + 10, lines.length); i++) {
    const line = lines[i].replace(/\/\/.*$/, '');
    collected.push(line.trim());
    if (line.includes('{') || (line.includes(':') && !line.includes('::'))) {
      break;
    }
  }
  return collected.join(' ');
}

export function extractSuperTypes(header: string, isInterface = false): string[] {
  const superTypes: string[] = [];

  if (isInterface) {
    // Interface inheritance: interface Cat extends Animal, Domesticated
    const extendsMatch = /\bextends\s+([A-Za-z0-9_$.<>\s,]+?)(?=\s*\{|\s*$)/.exec(header);
    if (extendsMatch) {
      const parts = extendsMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/<.*>/g, '').split('.').pop()!)
        .filter(Boolean);
      superTypes.push(...parts);
    }

    // C# / C++ interface inheritance: interface ICat : IAnimal, IDomesticated
    const colonMatch = /:\s*([A-Za-z0-9_$.<>\s,]+?)(?=\s*\{|\s*$)/.exec(header);
    if (colonMatch && !extendsMatch) {
      const parts = colonMatch[1]
        .split(',')
        .map((s) => s.trim().replace(/<.*>/g, '').replace(/^(?:public|private|protected)\s+/, '').split('.').pop()!)
        .filter(Boolean);
      superTypes.push(...parts);
    }
  } else {
    // Class inheritance: class Dog extends Animal (do NOT parse implements or mixins!)
    const extendsMatch = /\bextends\s+([A-Za-z0-9_$.<>]+)/.exec(header);
    if (extendsMatch) {
      const name = extendsMatch[1].replace(/<.*>/g, '').split('.').pop()!.trim();
      if (name) {
        superTypes.push(name);
      }
    }

    // C# / C++: class Dog : Animal, IPet (only the first type can be a base class, interfaces ignored)
    const colonMatch = /:\s*(?:public\s+|private\s+|protected\s+)?([A-Za-z0-9_$.<>]+)/.exec(header);
    if (colonMatch && !extendsMatch) {
      const name = colonMatch[1]
        .replace(/^(?:public|private|protected)\s+/, '')
        .replace(/<.*>/g, '')
        .split('.').pop()!
        .trim();
      if (name && !/^I[A-Z]/.test(name)) {
        superTypes.push(name);
      }
    }

    // Python: class Dog(Animal, CanRun):
    const pythonMatch = /\(([A-Za-z0-9_$,\s]+)\)\s*:/.exec(header);
    if (pythonMatch) {
      const parts = pythonMatch[1]
        .split(',')
        .map((s) => s.trim().split('.').pop()!)
        .filter((s) => Boolean(s) && s !== 'object');
      superTypes.push(...parts);
    }
  }

  return [...new Set(superTypes)];
}

export function buildTypeHierarchy(types: readonly FacetSymbolNode[]): FacetSymbolNode[] {
  const typeMap = new Map<string, FacetSymbolNode>();
  for (const t of types) {
    typeMap.set(t.name, t);
    t.subTypes = [];
  }

  const childNames = new Set<string>();

  for (const t of types) {
    if (t.superTypes && t.superTypes.length > 0) {
      for (const superName of t.superTypes) {
        const parent = typeMap.get(superName);
        if (parent) {
          // Strictly prevent classes and interfaces from being mixed in hierarchy
          if (t.kind === vscode.SymbolKind.Class && parent.kind === vscode.SymbolKind.Interface) {
            continue;
          }
          if (t.kind === vscode.SymbolKind.Interface && parent.kind === vscode.SymbolKind.Class) {
            continue;
          }

          if (!parent.subTypes) {
            parent.subTypes = [];
          }
          if (!parent.subTypes.some((sub) => sub.name === t.name)) {
            parent.subTypes.push(t);
          }
          childNames.add(t.name);
        }
      }
    }
  }

  return types.filter((t) => !childNames.has(t.name));
}
