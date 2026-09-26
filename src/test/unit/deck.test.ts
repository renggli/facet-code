import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeckViewProvider } from '../../deck/deckViewProvider';
import { FacetPipeline } from '../../pipeline/facetPipeline';
import { SymbolResolver } from '../../services/symbolResolver';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';

suite('DeckViewProvider Test Suite', () => {
  const dummyUri = vscode.Uri.file('/path/to/test.ts');
  const dummyRange = new vscode.Range(0, 0, 0, 0);

  const mockTypes: FacetSymbolNode[] = [
    {
      name: 'UserService',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [
        {
          name: 'getUser',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: dummyRange,
          selectionRange: dummyRange,
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: []
        }
      ]
    }
  ];

  test('DeckViewProvider resolves webview and renders html', () => {
    const pipeline = new FacetPipeline();
    const resolver = new SymbolResolver();
    const provider = new DeckViewProvider(dummyUri, pipeline, resolver);

    let htmlContent = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        get html() {
          return htmlContent;
        },
        set html(val: string) {
          htmlContent = val;
        }
      }
    };

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSymbols(mockTypes);

    assert.ok(htmlContent.includes('UserService'));
    assert.ok(htmlContent.includes('Types'));
    assert.ok(htmlContent.includes('Members'));
    assert.ok(htmlContent.includes('getUser'));
  });

  test('DeckViewProvider reflects horizontal and vertical layout changes', () => {
    const pipeline = new FacetPipeline();
    const resolver = new SymbolResolver();
    const provider = new DeckViewProvider(dummyUri, pipeline, resolver);

    let htmlContent = '';
    const mockWebviewView: any = {
      webview: {
        options: {},
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        get html() {
          return htmlContent;
        },
        set html(val: string) {
          htmlContent = val;
        }
      }
    };

    provider.resolveWebviewView(mockWebviewView, {} as any, {} as any);
    provider.setSymbols(mockTypes);

    // Initial orientation is horizontal
    assert.ok(htmlContent.includes('flex-direction: row'));

    // Toggle orientation to vertical
    pipeline.toggleOrientation();
    assert.ok(htmlContent.includes('flex-direction: column'));
  });
});
