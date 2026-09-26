import * as vscode from 'vscode';
import { FacetSymbolNode, MemberCategory, isTypeKind } from '../models/symbolNode';

export class SymbolResolver {
  private cache = new Map<string, { version: number; symbols: FacetSymbolNode[] }>();

  public clearCache(): void {
    this.cache.clear();
  }

  async resolveDocumentSymbols(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken
  ): Promise<FacetSymbolNode[]> {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === document.version) {
      return cached.symbols;
    }

    let nodes: FacetSymbolNode[] = [];

    const rawSymbols = await vscode.commands.executeCommand<
      (vscode.DocumentSymbol | vscode.SymbolInformation)[]
    >('vscode.executeDocumentSymbolProvider', document.uri);

    if (token?.isCancellationRequested) {
      return [];
    }

    if (rawSymbols && rawSymbols.length > 0) {
      if ('children' in rawSymbols[0]) {
        nodes = (rawSymbols as vscode.DocumentSymbol[]).map((s) =>
          this.fromDocumentSymbol(s, document.uri)
        );
      } else {
        nodes = this.fromSymbolInformations(
          rawSymbols as vscode.SymbolInformation[],
          document.uri
        );
      }
    } else {
      nodes = this.fallbackParse(document.getText(), document.uri);
    }

    this.cache.set(key, { version: document.version, symbols: nodes });
    return nodes;
  }

  async resolveWorkspaceTypes(
    query = '',
    token?: vscode.CancellationToken
  ): Promise<FacetSymbolNode[]> {
    const rawSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      query
    );

    if (token?.isCancellationRequested || !rawSymbols) {
      return [];
    }

    const typeSymbols = rawSymbols.filter((s) => isTypeKind(s.kind));
    const results: FacetSymbolNode[] = typeSymbols.map((s) => ({
      name: s.name,
      detail: s.containerName,
      kind: s.kind,
      uri: s.location.uri,
      range: s.location.range,
      selectionRange: s.location.range,
      category: MemberCategory.All,
      isStatic: false,
      children: []
    }));

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async hydrateTypeNode(
    typeNode: FacetSymbolNode,
    token?: vscode.CancellationToken
  ): Promise<FacetSymbolNode> {
    if (typeNode.children && typeNode.children.length > 0) {
      return typeNode;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(typeNode.uri);
      const allDocSymbols = await this.resolveDocumentSymbols(doc, token);
      const match = allDocSymbols.find((s) => s.name === typeNode.name && isTypeKind(s.kind));
      if (match) {
        typeNode.children = match.children;
        for (const child of typeNode.children) {
          child.parent = typeNode;
        }
      }
    } catch (err) {
      console.error('Error hydrating workspace type node:', err);
    }

    return typeNode;
  }

  public fromDocumentSymbol(
    sym: vscode.DocumentSymbol,
    uri: vscode.Uri,
    parent?: FacetSymbolNode
  ): FacetSymbolNode {
    const { category, isStatic } = this.categorize(sym.kind, sym.detail);

    const node: FacetSymbolNode = {
      name: sym.name,
      detail: sym.detail,
      kind: sym.kind,
      uri,
      range: sym.range,
      selectionRange: sym.selectionRange,
      category,
      isStatic,
      children: [],
      parent
    };

    if (sym.children && sym.children.length > 0) {
      node.children = sym.children.map((c) => this.fromDocumentSymbol(c, uri, node));
    }

    return node;
  }

  public fromSymbolInformations(
    syms: vscode.SymbolInformation[],
    uri: vscode.Uri
  ): FacetSymbolNode[] {
    const containerMap = new Map<string, FacetSymbolNode[]>();
    const roots: FacetSymbolNode[] = [];

    for (const s of syms) {
      const { category, isStatic } = this.categorize(s.kind);
      const node: FacetSymbolNode = {
        name: s.name,
        kind: s.kind,
        uri,
        range: s.location.range,
        selectionRange: s.location.range,
        category,
        isStatic,
        children: []
      };

      if (!s.containerName) {
        roots.push(node);
      } else {
        const list = containerMap.get(s.containerName) || [];
        list.push(node);
        containerMap.set(s.containerName, list);
      }
    }

    for (const root of roots) {
      const children = containerMap.get(root.name) || [];
      for (const child of children) {
        child.parent = root;
      }
      root.children = children;
    }

    return roots;
  }

  public fallbackParse(text: string, uri: vscode.Uri): FacetSymbolNode[] {
    const nodes: FacetSymbolNode[] = [];
    const lines = text.split('\n');

    // Matches classes, interfaces, structs, enums
    const typeRegex = /(?:export\s+)?(?:abstract\s+)?(class|interface|enum|struct)\s+([A-Za-z0-9_]+)/;
    // Matches methods, functions, getters/setters, properties
    const memberRegex = /^\s*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(get|set)\s+)?([A-Za-z0-9_]+)\s*(?:\((.*?)\))?/;

    let currentTypeNode: FacetSymbolNode | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const typeMatch = typeRegex.exec(line);

      if (typeMatch) {
        const typeKind = typeMatch[1];
        const typeName = typeMatch[2];
        const kind =
          typeKind === 'interface'
            ? vscode.SymbolKind.Interface
            : typeKind === 'enum'
            ? vscode.SymbolKind.Enum
            : typeKind === 'struct'
            ? vscode.SymbolKind.Struct
            : vscode.SymbolKind.Class;

        const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.length));
        currentTypeNode = {
          name: typeName,
          kind,
          uri,
          range,
          selectionRange: range,
          category: MemberCategory.All,
          isStatic: false,
          children: []
        };
        nodes.push(currentTypeNode);
        continue;
      }

      if (currentTypeNode) {
        const trimmed = line.trim();
        if (trimmed.startsWith('}') && line.search(/\S/) <= (currentTypeNode.range.start.character || 0)) {
          currentTypeNode = null;
          continue;
        }

        const memberMatch = memberRegex.exec(line);
        if (memberMatch && memberMatch[4] && !['if', 'for', 'while', 'switch', 'return'].includes(memberMatch[4])) {
          const isStatic = Boolean(memberMatch[2]);
          const isAccessor = Boolean(memberMatch[3]);
          const memberName = memberMatch[4];
          const isMethod = memberMatch[5] !== undefined;

          let category = MemberCategory.Fields;
          let kind = vscode.SymbolKind.Field;

          if (isAccessor) {
            category = MemberCategory.Accessors;
            kind = vscode.SymbolKind.Property;
          } else if (isMethod) {
            if (memberName === 'constructor') {
              category = MemberCategory.Constructors;
              kind = vscode.SymbolKind.Constructor;
            } else if (isStatic) {
              category = MemberCategory.StaticMethods;
              kind = vscode.SymbolKind.Method;
            } else {
              category = MemberCategory.InstanceMethods;
              kind = vscode.SymbolKind.Method;
            }
          }

          const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.length));
          const memberNode: FacetSymbolNode = {
            name: memberName,
            kind,
            uri,
            range,
            selectionRange: range,
            category,
            isStatic,
            children: [],
            parent: currentTypeNode
          };
          currentTypeNode.children.push(memberNode);
        }
      }
    }

    return nodes;
  }

  public categorize(
    kind: vscode.SymbolKind,
    detail?: string
  ): { category: MemberCategory; isStatic: boolean } {
    const detailLower = detail?.toLowerCase() ?? '';
    const isStatic = detailLower.includes('static');

    switch (kind) {
      case vscode.SymbolKind.Constant:
      case vscode.SymbolKind.Enum:
      case vscode.SymbolKind.EnumMember:
        return { category: MemberCategory.Constants, isStatic: true };

      case vscode.SymbolKind.Field:
      case vscode.SymbolKind.Property:
      case vscode.SymbolKind.Variable:
        if (detailLower.includes('get ') || detailLower.includes('set ')) {
          return { category: MemberCategory.Accessors, isStatic };
        }
        return { category: MemberCategory.Fields, isStatic };

      case vscode.SymbolKind.Constructor:
        return { category: MemberCategory.Constructors, isStatic: false };

      case vscode.SymbolKind.Method:
      case vscode.SymbolKind.Function:
        if (detailLower.includes('get ') || detailLower.includes('set ')) {
          return { category: MemberCategory.Accessors, isStatic };
        }
        return {
          category: isStatic ? MemberCategory.StaticMethods : MemberCategory.InstanceMethods,
          isStatic
        };

      default:
        return { category: MemberCategory.Special, isStatic };
    }
  }
}
