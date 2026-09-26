import * as assert from 'assert';
import * as vscode from 'vscode';
import { FacetPipeline } from '../../pipeline/facetPipeline';
import { MemberCategory, FacetSymbolNode } from '../../models/symbolNode';
import { FacetStageConfig } from '../../models/pipelineConfig';

suite('FacetPipeline Test Suite', () => {
  const dummyUri = vscode.Uri.file('/path/to/test.ts');
  const dummyRange = new vscode.Range(0, 0, 0, 0);

  const mockTypes: FacetSymbolNode[] = [
    {
      name: 'ClassA',
      kind: vscode.SymbolKind.Class,
      uri: dummyUri,
      range: dummyRange,
      selectionRange: dummyRange,
      category: MemberCategory.All,
      isStatic: false,
      children: [
        {
          name: 'render',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: dummyRange,
          selectionRange: dummyRange,
          category: MemberCategory.InstanceMethods,
          isStatic: false,
          children: []
        },
        {
          name: 'defaultInstance',
          kind: vscode.SymbolKind.Method,
          uri: dummyUri,
          range: dummyRange,
          selectionRange: dummyRange,
          category: MemberCategory.StaticMethods,
          isStatic: true,
          children: []
        }
      ]
    }
  ];

  test('FacetPipeline initializes with default Smalltalk pipeline and toggles orientation', () => {
    const pipeline = new FacetPipeline();
    assert.strictEqual(pipeline.getOrientation(), 'horizontal');
    assert.strictEqual(pipeline.getStages().length, 4);

    assert.strictEqual(pipeline.toggleOrientation(), 'vertical');
    assert.strictEqual(pipeline.getOrientation(), 'vertical');

    assert.strictEqual(pipeline.toggleOrientation(), 'horizontal');
    assert.strictEqual(pipeline.getOrientation(), 'horizontal');
  });

  test('FacetPipeline allows adding, moving, updating, and removing stages on the fly', () => {
    const pipeline = new FacetPipeline();
    const initialCount = pipeline.getStages().length;

    const customStage: FacetStageConfig = {
      id: 'custom-stage',
      title: 'Custom Stage',
      source: 'document.symbols',
      displayMode: 'list',
      allowMultiSelect: false,
      classSide: 'both',
      categoryFilter: MemberCategory.All,
      sortBy: 'name',
      revealOnSelect: false
    };

    // Add stage
    pipeline.addStage(customStage, 1);
    assert.strictEqual(pipeline.getStages().length, initialCount + 1);
    assert.strictEqual(pipeline.getStages()[1].id, 'custom-stage');

    // Update stage
    pipeline.updateStage('custom-stage', { title: 'Updated Custom Stage', displayMode: 'tree' });
    assert.strictEqual(pipeline.getStages()[1].title, 'Updated Custom Stage');
    assert.strictEqual(pipeline.getStages()[1].displayMode, 'tree');

    // Move stage
    pipeline.moveStage('custom-stage', 'forward');
    assert.strictEqual(pipeline.getStages()[2].id, 'custom-stage');

    pipeline.moveStage('custom-stage', 'backward');
    assert.strictEqual(pipeline.getStages()[1].id, 'custom-stage');

    // Remove stage
    const removed = pipeline.removeStage('custom-stage');
    assert.ok(removed);
    assert.strictEqual(pipeline.getStages().length, initialCount);
  });

  test('FacetPipeline evaluates stages and propagates selection downstream', () => {
    const pipeline = new FacetPipeline();
    const results = pipeline.evaluatePipeline(mockTypes);

    assert.strictEqual(results.length, 4);

    // Stage 0: Types
    const typeStage = results[0];
    assert.strictEqual(typeStage.title, 'Types');
    assert.strictEqual(typeStage.items.length, 1);
    assert.strictEqual(typeStage.items[0].label, 'ClassA');

    // Stage 1: Categories
    const categoryStage = results[1];
    assert.strictEqual(categoryStage.title, 'Categories');
    assert.ok(categoryStage.items.length >= 5);

    // Stage 2: Members filtered (instance side by default in smalltalk preset)
    const memberStage = results[2];
    assert.strictEqual(memberStage.items.length, 1);
    assert.strictEqual(memberStage.items[0].label, 'render');

    // Change stage config to class side on the fly and re-evaluate
    pipeline.updateStage('stage-members', { classSide: 'class' });
    const classResults = pipeline.evaluatePipeline(mockTypes);
    const updatedMemberStage = classResults[2];
    assert.strictEqual(updatedMemberStage.items.length, 1);
    assert.strictEqual(updatedMemberStage.items[0].label, 'defaultInstance');
  });

  test('FacetPipeline switches presets on the fly', () => {
    const pipeline = new FacetPipeline();

    pipeline.loadPreset('implementors');
    assert.strictEqual(pipeline.getConfig().id, 'implementors');
    assert.strictEqual(pipeline.getStages().length, 2);

    pipeline.loadPreset('senders');
    assert.strictEqual(pipeline.getConfig().id, 'senders');
    assert.strictEqual(pipeline.getStages().length, 2);

    pipeline.loadPreset('smalltalk');
    assert.strictEqual(pipeline.getConfig().id, 'smalltalk-system');
    assert.strictEqual(pipeline.getStages().length, 4);
  });
});
