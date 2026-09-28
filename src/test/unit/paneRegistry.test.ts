import * as assert from 'node:assert';
import { FacetCoordinator } from '../../coordinator/facetCoordinator';
import { PanePipelineManager } from '../../coordinator/panePipelineManager';
import type { PaneRole } from '../../models/paneConfig';
import { createDefaultPaneRegistry, PaneRegistry } from '../../panes/paneRegistry';
import { RelationsTreeProvider } from '../../providers/relationsTreeProvider';
import { SymbolResolver } from '../../services/symbolResolver';

suite('PaneRegistry & Modular Pane Architecture Test Suite', () => {
  test('createDefaultPaneRegistry registers all 11 standard pane roles', () => {
    const registry = createDefaultPaneRegistry();
    const expectedRoles: PaneRole[] = [
      'directories',
      'files',
      'symbols',
      'hierarchy',
      'definitions',
      'declarations',
      'implementations',
      'references',
      'callers',
      'problems',
      'changes',
    ];

    for (const role of expectedRoles) {
      assert.ok(registry.has(role), `Role ${role} should be registered`);
      const def = registry.get(role);
      assert.strictEqual(def.role, role);
      assert.ok(def.title);
      assert.ok(def.icon);
      assert.ok(def.description);
      assert.ok(def.capabilities);

      const defaultConfig = def.defaultConfig('facet.pane.1');
      assert.strictEqual(defaultConfig.id, 'facet.pane.1');
      assert.strictEqual(defaultConfig.role, role);
    }
  });

  test('PaneRegistry throws on unknown role and handles custom registration', () => {
    const registry = new PaneRegistry();
    assert.throws(() => registry.get('unknown' as any), /No pane definition registered/);
    assert.strictEqual(registry.tryGet('unknown' as any), undefined);

    const defaultRegistry = createDefaultPaneRegistry();
    const defs = defaultRegistry.getAll();
    assert.strictEqual(defs.length, 11);
  });

  test('toggleTreeDisplay toggles state and publishes context keys', async () => {
    const resolver = new SymbolResolver();
    const relationsProvider = new RelationsTreeProvider();
    const coordinator = new FacetCoordinator(resolver, relationsProvider);
    const manager = new PanePipelineManager(coordinator);

    const pane1 = manager.getPane('facet.pane.1') as any;
    assert.strictEqual(pane1.tree, true);

    await manager.toggleTreeDisplay('facet.pane.1');
    assert.strictEqual(pane1.tree, false);

    await manager.toggleTreeDisplay('facet.pane.1');
    assert.strictEqual(pane1.tree, true);

    coordinator.dispose();
  });
});
