import * as assert from 'node:assert';
import * as vscode from 'vscode';
import {
  createDefaultPanes,
  createDirectoriesPane,
  createFilesPane,
  createImplementationsPane,
  createReferencesPane,
  createSymbolsPane,
  matchesGlob,
  matchesPaneFilters,
  type SymbolsPaneConfig,
} from '../../models/paneConfig';

suite('PaneConfig & Filter Helpers Test Suite', () => {
  suite('matchesGlob', () => {
    test('returns true for empty, undefined, or whitespace pattern', () => {
      assert.strictEqual(matchesGlob('src/index.ts', undefined), true);
      assert.strictEqual(matchesGlob('src/index.ts', ''), true);
      assert.strictEqual(matchesGlob('src/index.ts', '   '), true);
    });

    test('matches exact file or folder name', () => {
      assert.strictEqual(matchesGlob('src/index.ts', 'index.ts'), true);
      assert.strictEqual(matchesGlob('src/index.ts', 'src/index.ts'), true);
      assert.strictEqual(matchesGlob('src/order.ts', 'index.ts'), false);
    });

    test('matches single asterisk wildcards', () => {
      assert.strictEqual(matchesGlob('src/service.ts', '*.ts'), true);
      assert.strictEqual(matchesGlob('src/service.js', '*.ts'), false);
      assert.strictEqual(matchesGlob('src/test/service.test.ts', '*test.ts'), true);
    });

    test('matches double asterisk globstars', () => {
      assert.strictEqual(matchesGlob('src/deep/nested/file.ts', 'src/**/*.ts'), true);
      assert.strictEqual(matchesGlob('test/deep/nested/file.ts', 'src/**/*.ts'), false);
      assert.strictEqual(matchesGlob('root.ts', '**/*.ts'), true);
    });

    test('matches question mark single character', () => {
      assert.strictEqual(matchesGlob('file1.ts', 'file?.ts'), true);
      assert.strictEqual(matchesGlob('file12.ts', 'file?.ts'), false);
    });

    test('handles negation with exclamation mark', () => {
      assert.strictEqual(matchesGlob('src/test.spec.ts', '!*.spec.ts'), false);
      assert.strictEqual(matchesGlob('src/test.ts', '!*.spec.ts'), true);
    });

    test('handles group braces', () => {
      assert.strictEqual(matchesGlob('index.ts', '*.{ts,js}'), true);
      assert.strictEqual(matchesGlob('index.js', '*.{ts,js}'), true);
      assert.strictEqual(matchesGlob('index.css', '*.{ts,js}'), false);
    });

    test('handles regexp literals', () => {
      assert.strictEqual(matchesGlob('src/orderService.ts', '/order.*\\.ts$/i'), true);
      assert.strictEqual(matchesGlob('src/paymentService.ts', '/order.*\\.ts$/i'), false);
      // Malformed regex falls back safely
      assert.strictEqual(matchesGlob('src/order.ts', '/[invalid(/i'), false);
    });

    test('escapes special regex characters correctly', () => {
      assert.strictEqual(matchesGlob('src/file+name.ts', 'file+name.ts'), true);
      assert.strictEqual(matchesGlob('src/file(1).ts', 'file(1).ts'), true);
      assert.strictEqual(matchesGlob('src/file[1].ts', 'file[1].ts'), true);
    });
  });

  suite('matchesPaneFilters', () => {
    test('returns true when filters are absent or key is true', () => {
      assert.strictEqual(matchesPaneFilters({ kind: vscode.SymbolKind.Class }, undefined), true);
      assert.strictEqual(matchesPaneFilters({ kind: vscode.SymbolKind.Class }, {}), true);
      assert.strictEqual(matchesPaneFilters({ kind: vscode.SymbolKind.Class }, { class: true }), true);
    });

    test('returns false when symbol kind is disabled in filters', () => {
      assert.strictEqual(matchesPaneFilters({ kind: vscode.SymbolKind.Method }, { method: false }), false);
      assert.strictEqual(matchesPaneFilters({ kind: vscode.SymbolKind.Class }, { class: false }), false);
    });

    test('returns true when node has no kind property', () => {
      assert.strictEqual(matchesPaneFilters({}, { class: false }), true);
    });
  });

  suite('Pane Factory Functions', () => {
    test('createDefaultPanes creates 6 panes with 4 default visible panes matching Project Browser', () => {
      const panes = createDefaultPanes();
      assert.strictEqual(panes.length, 6);
      assert.strictEqual(panes[0].role, 'directories');
      assert.strictEqual(panes[0].visible, true);
      assert.strictEqual(panes[1].role, 'files');
      assert.strictEqual(panes[1].visible, true);
      assert.strictEqual(panes[2].role, 'symbols');
      assert.strictEqual(panes[2].title, 'Definitions');
      assert.strictEqual((panes[2] as SymbolsPaneConfig).tree, false);
      assert.strictEqual(panes[2].visible, true);
      assert.strictEqual(panes[3].role, 'symbols');
      assert.strictEqual(panes[3].title, 'Members');
      assert.strictEqual((panes[3] as SymbolsPaneConfig).tree, true);
      assert.strictEqual(panes[3].visible, true);
      assert.strictEqual(panes[4].role, 'references');
      assert.strictEqual(panes[4].visible, false);
      assert.strictEqual(panes[5].role, 'implementations');
      assert.strictEqual(panes[5].visible, false);
    });

    test('default pane factory functions create valid pane configurations', () => {
      const symbols = createSymbolsPane('facet.pane.3');
      assert.strictEqual(symbols.role, 'symbols');
      assert.strictEqual(symbols.tree, true);

      const dir = createDirectoriesPane('facet.pane.1');
      assert.strictEqual(dir.role, 'directories');
      assert.strictEqual(dir.tree, true);

      const files = createFilesPane('facet.pane.2');
      assert.strictEqual(files.role, 'files');
      assert.strictEqual(files.tree, false);

      const impls = createImplementationsPane('facet.pane.5');
      assert.strictEqual(impls.role, 'implementations');

      const refs = createReferencesPane('facet.pane.5');
      assert.strictEqual(refs.role, 'references');
    });
  });
});
