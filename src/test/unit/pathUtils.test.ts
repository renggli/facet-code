import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { getPathBasename, getRelativePath } from '../../shared/pathUtils';

suite('PathUtils Test Suite', () => {
  suite('getPathBasename', () => {
    test('handles empty paths', () => {
      assert.strictEqual(getPathBasename(''), '');
    });

    test('preserves root path', () => {
      assert.strictEqual(getPathBasename('/'), '/');
      assert.strictEqual(getPathBasename('///'), '/');
    });

    test('handles single-segment paths with and without trailing slash', () => {
      assert.strictEqual(getPathBasename('services'), 'services');
      assert.strictEqual(getPathBasename('services/'), 'services');
      assert.strictEqual(getPathBasename('services///'), 'services');
      assert.strictEqual(getPathBasename('/services'), 'services');
      assert.strictEqual(getPathBasename('/services/'), 'services');
      assert.strictEqual(getPathBasename('/services///'), 'services');
    });

    test('handles multi-segment paths with and without trailing slash', () => {
      assert.strictEqual(getPathBasename('/workspace/src/services'), 'services');
      assert.strictEqual(getPathBasename('/workspace/src/services/'), 'services');
      assert.strictEqual(getPathBasename('/workspace/src/services///'), 'services');
      assert.strictEqual(getPathBasename('workspace/src/services/'), 'services');
      assert.strictEqual(getPathBasename('workspace/src/services'), 'services');
    });

    test('handles Windows backslash separators', () => {
      assert.strictEqual(getPathBasename('C:\\workspace\\src\\services\\'), 'services');
      assert.strictEqual(getPathBasename('workspace\\src\\services'), 'services');
      assert.strictEqual(getPathBasename('services\\'), 'services');
    });

    test('handles vscode.Uri input with and without trailing slash', () => {
      assert.strictEqual(getPathBasename(vscode.Uri.file('/workspace/src/services/')), 'services');
      assert.strictEqual(getPathBasename(vscode.Uri.file('/workspace/src/services')), 'services');
      assert.strictEqual(getPathBasename(vscode.Uri.file('/')), '/');
    });
  });

  suite('getRelativePath', () => {
    test('normalizes relative path and backslashes', () => {
      const uri = vscode.Uri.file('/workspace/src/index.ts');
      const rel = getRelativePath(uri);
      assert.ok(typeof rel === 'string');
      assert.ok(!rel.includes('\\'));
    });
  });
});
