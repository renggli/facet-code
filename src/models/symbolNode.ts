import * as vscode from 'vscode';
import { matchesPaneFilters, type PaneFilters, SortOption } from './paneConfig';

export enum MemberCategory {
  All = 'all',
  Constants = 'constants',
  Fields = 'fields',
  Constructors = 'constructors',
  InstanceMethods = 'instanceMethods',
  StaticMethods = 'staticMethods',
  Accessors = 'accessors',
  Special = 'special',
}

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

export function unionMembers(types: readonly FacetSymbolNode[]): FacetSymbolNode[] {
  const result: FacetSymbolNode[] = [];
  const seen = new Set<string>();

  for (const t of types) {
    if (t.children.length === 0 && !isTypeKind(t.kind)) {
      const key = `${t.name}:${t.kind}:${t.isStatic}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
      }
    } else {
      for (const member of t.children) {
        const key = `${member.name}:${member.kind}:${member.isStatic}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(member);
        }
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
  let actualStart = startLine;
  if (!/\b(class|interface|struct|enum)\b/.test(lines[startLine] ?? '')) {
    for (let j = Math.max(0, startLine - 5); j <= Math.min(startLine + 20, lines.length - 1); j++) {
      if (/\b(class|interface|struct|enum)\b/.test(lines[j])) {
        actualStart = j;
        break;
      }
    }
  }

  for (let i = actualStart; i < Math.min(actualStart + 15, lines.length); i++) {
    const line = lines[i].replace(/\/\/.*$/, '');
    collected.push(line.trim());
    if (line.includes('{')) {
      break;
    }
  }
  return collected.join(' ');
}

export function extractSuperTypes(header: string, isInterface = false): string[] {
  const superTypes: string[] = [];

  // Strip generic type parameters on the declared type itself to avoid matching 'extends' inside <T extends Foo>
  const cleanedHeader = header.replace(/\b(class|interface|struct|enum)\s+([A-Za-z0-9_$]+)\s*<[^>{}]*>/, '$1 $2');

  if (isInterface) {
    // Interface inheritance: interface Cat extends Animal, Domesticated
    const extendsMatch = /\bextends\s+([A-Za-z0-9_$.<>\s,]+?)(?=\s*\{|\s*$)/.exec(cleanedHeader);
    if (extendsMatch) {
      const parts = extendsMatch[1]
        .split(',')
        .map(
          (s) =>
            s
              .trim()
              .replace(/<[^>]*>/g, '')
              .split('.')
              .pop()!,
        )
        .filter(Boolean);
      superTypes.push(...parts);
    }

    // C# / C++ interface inheritance: interface ICat : IAnimal, IDomesticated
    const colonMatch = /:\s*([A-Za-z0-9_$.<>\s,]+?)(?=\s*\{|\s*$)/.exec(cleanedHeader);
    if (colonMatch && !extendsMatch) {
      const parts = colonMatch[1]
        .split(',')
        .map(
          (s) =>
            s
              .trim()
              .replace(/<[^>]*>/g, '')
              .replace(/^(?:public|private|protected)\s+/, '')
              .split('.')
              .pop()!,
        )
        .filter(Boolean);
      superTypes.push(...parts);
    }
  } else {
    // Class inheritance: class Dog extends Animal (ignores generic args and interfaces)
    const extendsMatch = /\bextends\s+([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)*)/.exec(cleanedHeader);
    if (extendsMatch) {
      const name = extendsMatch[1].split('.').pop()!.trim();
      if (name) {
        superTypes.push(name);
      }
    }

    // C# / C++: class Dog : Animal, IPet (only the first type can be a base class, interfaces ignored)
    const colonMatch = /:\s*(?:public\s+|private\s+|protected\s+)?([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)*)/.exec(
      cleanedHeader,
    );
    if (colonMatch && !extendsMatch) {
      const name = colonMatch[1].split('.').pop()!.trim();
      if (name && !/^I[A-Z]/.test(name)) {
        superTypes.push(name);
      }
    }

    // Python: class Dog(Animal, CanRun):
    const pythonMatch = /\(([A-Za-z0-9_$,\s]+)\)\s*:/.exec(cleanedHeader);
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

export function buildTypeHierarchy(
  types: readonly FacetSymbolNode[],
  allowedSubclassKinds?: vscode.SymbolKind[],
  filters?: PaneFilters,
): FacetSymbolNode[] {
  const typeMap = new Map<string, FacetSymbolNode[]>();
  const childKeys = new Set<string>();
  const childNames = new Set<string>();

  for (const t of types) {
    const list = typeMap.get(t.name) ?? [];
    list.push(t);
    typeMap.set(t.name, list);
    t.subTypes = t.subTypes && t.subTypes.length > 0 ? [...t.subTypes] : [];
    t.parent = undefined;
    for (const sub of t.subTypes) {
      sub.parent = t;
      childKeys.add(`${sub.name}::${sub.uri?.toString() ?? ''}`);
      childNames.add(sub.name);
    }
  }

  for (const t of types) {
    if (allowedSubclassKinds && !allowedSubclassKinds.includes(t.kind)) {
      continue;
    }

    if (t.superTypes && t.superTypes.length > 0) {
      for (const superName of t.superTypes) {
        const parents = typeMap.get(superName);
        if (parents && parents.length > 0) {
          for (const parent of parents) {
            // Strictly prevent classes and interfaces from being mixed in hierarchy
            if (t.kind === vscode.SymbolKind.Class && parent.kind === vscode.SymbolKind.Interface) {
              continue;
            }
            if (t.kind === vscode.SymbolKind.Interface && parent.kind === vscode.SymbolKind.Class) {
              continue;
            }

            // Cycle detection
            let curr: FacetSymbolNode | undefined = parent;
            let cycle = false;
            while (curr) {
              if (curr.name === t.name) {
                cycle = true;
                break;
              }
              curr = curr.parent;
            }
            if (cycle) {
              continue;
            }

            if (!parent.subTypes) {
              parent.subTypes = [];
            }
            if (!parent.subTypes.some((sub: FacetSymbolNode) => sub.name === t.name)) {
              t.parent = parent;
              parent.subTypes.push(t);
            }
            childKeys.add(`${t.name}::${t.uri?.toString() ?? ''}`);
            childNames.add(t.name);
          }
        }
      }
    }
  }

  // Filter based on leaves: keep branches that lead to at least one matching leaf
  const filterLeaves = (node: FacetSymbolNode): boolean => {
    if (node.subTypes && node.subTypes.length > 0) {
      node.subTypes = node.subTypes.filter((sub) => filterLeaves(sub));
      if (node.subTypes.length > 0) {
        return true;
      }
    }
    return matchesPaneFilters(node, filters);
  };

  const rootSeen = new Set<string>();
  const uniqueRoots: FacetSymbolNode[] = [];
  for (const t of types) {
    const key = `${t.name}::${t.uri?.toString() ?? ''}`;
    // Strictly exclude any type nested elsewhere in the hierarchy
    if (childKeys.has(key) || childNames.has(t.name) || t.parent !== undefined) {
      continue;
    }

    if (rootSeen.has(t.name)) {
      // Merge subTypes into existing root node
      const existing = uniqueRoots.find((r) => r.name === t.name);
      if (existing && t.subTypes && t.subTypes.length > 0) {
        existing.subTypes = existing.subTypes ?? [];
        for (const sub of t.subTypes) {
          if (!existing.subTypes.some((s) => s.name === sub.name)) {
            existing.subTypes.push(sub);
          }
        }
      }
      continue;
    }

    if (filterLeaves(t)) {
      rootSeen.add(t.name);
      uniqueRoots.push(t);
    }
  }

  return uniqueRoots;
}

export function sortSymbolNodes<T extends FacetSymbolNode>(items: readonly T[], sort: SortOption): T[] {
  const copy = items.slice();
  return copy.sort((a, b) => {
    const uriA = a.uri ? (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(a.uri) : a.uri.fsPath) : '';
    const uriB = b.uri ? (vscode.workspace.asRelativePath ? vscode.workspace.asRelativePath(b.uri) : b.uri.fsPath) : '';
    const uriDiff = uriA.localeCompare(uriB);

    const lineDiff = (a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0);
    const charDiff = (a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0);

    if (sort === SortOption.Category) {
      const kindDiff = a.kind - b.kind;
      if (kindDiff !== 0) {
        return kindDiff;
      }
      const nameDiff = a.name.localeCompare(b.name);
      if (nameDiff !== 0) {
        return nameDiff;
      }
      if (uriDiff !== 0) {
        return uriDiff;
      }
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return charDiff;
    }

    if (sort === SortOption.Position) {
      if (uriDiff !== 0) {
        return uriDiff;
      }
      if (lineDiff !== 0) {
        return lineDiff;
      }
      if (charDiff !== 0) {
        return charDiff;
      }
      return a.name.localeCompare(b.name);
    }

    // Default: 'name'
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) {
      return nameDiff;
    }
    if (uriDiff !== 0) {
      return uriDiff;
    }
    if (lineDiff !== 0) {
      return lineDiff;
    }
    return charDiff;
  });
}

export async function resolveExactSymbolPosition(node: FacetSymbolNode): Promise<vscode.Position> {
  if (node.selectionRange && !node.selectionRange.start.isEqual(node.range.start)) {
    return node.selectionRange.start;
  }
  if (!node.uri) {
    return node.selectionRange?.start ?? node.range.start;
  }
  try {
    const textDocs = vscode.workspace.textDocuments ?? [];
    const openDoc = textDocs.find((d) => d.uri.toString() === node.uri.toString());
    const doc = openDoc ?? (await vscode.workspace.openTextDocument(node.uri));
    if (doc) {
      const startLine = node.range.start.line;
      const endLine = Math.min(node.range.end.line, startLine + 5, doc.lineCount - 1);
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const lineText = doc.lineAt(lineNum).text;
        const idx = lineText.indexOf(node.name);
        if (idx !== -1) {
          return new vscode.Position(lineNum, idx);
        }
      }
    }
  } catch {
    // Fall back to selectionRange or range start
  }
  return node.selectionRange?.start ?? node.range.start;
}
