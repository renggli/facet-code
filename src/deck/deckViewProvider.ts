import * as vscode from 'vscode';
import { FacetPipeline, StageDataResult, StageItem } from '../pipeline/facetPipeline';
import { SymbolResolver } from '../services/symbolResolver';
import { FacetStageConfig, PipelineOrientation, StageDataSource, StageDisplayMode } from '../models/pipelineConfig';
import { ClassSide, MemberCategory } from '../models/symbolNode';

export class DeckViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'facet.views.deck';

  private view?: vscode.WebviewView;
  private currentSymbols: any[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly pipeline: FacetPipeline,
    private readonly resolver: SymbolResolver
  ) {
    this.pipeline.onDidChangePipeline(() => {
      this.refresh();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });

    this.refresh();
  }

  public setSymbols(symbols: any[]): void {
    this.currentSymbols = symbols;
    this.refresh();
  }

  public refresh(): void {
    if (!this.view) {
      return;
    }
    const stagesData = this.pipeline.evaluatePipeline(this.currentSymbols);
    const orientation = this.pipeline.getOrientation();
    this.view.webview.html = this.renderHtml(stagesData, orientation);
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'selectItem': {
        const { stageId, itemId, multi } = message;
        let current = this.pipeline.getStageSelection(stageId);
        if (multi) {
          if (current.includes(itemId)) {
            current = current.filter((id) => id !== itemId);
          } else {
            current = [...current, itemId];
          }
        } else {
          current = [itemId];
        }
        this.pipeline.setStageSelection(stageId, current);

        const stage = this.pipeline.getStages().find((s) => s.id === stageId);
        if (stage?.revealOnSelect && message.range && message.uri) {
          try {
            const uri = vscode.Uri.parse(message.uri);
            const doc = await vscode.workspace.openTextDocument(uri);
            const start = new vscode.Position(message.range.start.line, message.range.start.character);
            const end = new vscode.Position(message.range.end.line, message.range.end.character);
            await vscode.window.showTextDocument(doc, {
              selection: new vscode.Range(start, end),
              preserveFocus: true,
              viewColumn: vscode.ViewColumn.Active
            });
          } catch (err) {
            console.error('Error revealing symbol:', err);
          }
        }

        this.refresh();
        break;
      }

      case 'moveStage': {
        this.pipeline.moveStage(message.stageId, message.direction);
        break;
      }

      case 'removeStage': {
        this.pipeline.removeStage(message.stageId);
        break;
      }

      case 'configureStage': {
        await this.promptConfigureStage(message.stageId);
        break;
      }

      case 'toggleOrientation': {
        this.pipeline.toggleOrientation();
        break;
      }

      case 'addStage': {
        await this.promptAddStage();
        break;
      }

      case 'switchPreset': {
        await this.promptSwitchPreset();
        break;
      }
    }
  }

  public async promptConfigureStage(stageId: string): Promise<void> {
    const stage = this.pipeline.getStages().find((s) => s.id === stageId);
    if (!stage) {
      return;
    }

    const options: vscode.QuickPickItem[] = [
      {
        label: '$(symbol-property) Change Display Mode',
        description: `Current: ${stage.displayMode}`
      },
      {
        label: '$(database) Change Data Source',
        description: `Current: ${stage.source}`
      },
      {
        label: '$(check-all) Toggle Multi-Selection',
        description: `Currently: ${stage.allowMultiSelect ? 'Enabled' : 'Disabled'}`
      },
      {
        label: '$(arrow-swap) Toggle Side (Instance / Class)',
        description: `Current: ${stage.classSide}`
      },
      {
        label: '$(sort-precedence) Change Sort Order',
        description: `Current: ${stage.sortBy}`
      },
      {
        label: '$(eye) Toggle Reveal in Editor on Select',
        description: `Currently: ${stage.revealOnSelect ? 'Enabled' : 'Disabled'}`
      },
      {
        label: '$(edit) Rename Stage',
        description: stage.title
      }
    ];

    const pick = await vscode.window.showQuickPick(options, {
      placeHolder: `Configure stage: ${stage.title}`
    });

    if (!pick) {
      return;
    }

    if (pick.label.includes('Display Mode')) {
      const modePick = await vscode.window.showQuickPick(
        [
          { label: 'list', description: 'Flat list of items' },
          { label: 'tree', description: 'Collapsible hierarchical tree' },
          { label: 'chips', description: 'Horizontal filter chips / toggle buttons' }
        ],
        { placeHolder: 'Select display mode' }
      );
      if (modePick) {
        this.pipeline.updateStage(stageId, { displayMode: modePick.label as StageDisplayMode });
      }
    } else if (pick.label.includes('Data Source')) {
      const sourcePick = await vscode.window.showQuickPick(
        [
          { label: 'document.types', description: 'Classes, Interfaces, Enums in active file' },
          { label: 'document.categories', description: 'Member kinds (Constructors, Fields, Methods, Static)' },
          { label: 'members.filtered', description: 'Filtered members belonging to selected types' },
          { label: 'document.symbols', description: 'All document outline symbols' },
          { label: 'relations.references', description: 'References across workspace' },
          { label: 'relations.callers', description: 'Incoming call hierarchy' },
          { label: 'relations.implementations', description: 'Implementations / subtypes' }
        ],
        { placeHolder: 'Select data source' }
      );
      if (sourcePick) {
        this.pipeline.updateStage(stageId, { source: sourcePick.label as StageDataSource });
      }
    } else if (pick.label.includes('Multi-Selection')) {
      this.pipeline.updateStage(stageId, { allowMultiSelect: !stage.allowMultiSelect });
    } else if (pick.label.includes('Toggle Side')) {
      const nextSide: Record<ClassSide, ClassSide> = {
        instance: 'class',
        class: 'both',
        both: 'instance'
      };
      this.pipeline.updateStage(stageId, { classSide: nextSide[stage.classSide] });
    } else if (pick.label.includes('Sort Order')) {
      const sortPick = await vscode.window.showQuickPick(
        [
          { label: 'name', description: 'Alphabetical by name' },
          { label: 'position', description: 'Source file line position' },
          { label: 'kind', description: 'Group by member kind' }
        ],
        { placeHolder: 'Select sort strategy' }
      );
      if (sortPick) {
        this.pipeline.updateStage(stageId, { sortBy: sortPick.label as 'name' | 'position' | 'kind' });
      }
    } else if (pick.label.includes('Reveal in Editor')) {
      this.pipeline.updateStage(stageId, { revealOnSelect: !stage.revealOnSelect });
    } else if (pick.label.includes('Rename Stage')) {
      const newTitle = await vscode.window.showInputBox({
        value: stage.title,
        prompt: 'Enter new stage title'
      });
      if (newTitle) {
        this.pipeline.updateStage(stageId, { title: newTitle });
      }
    }
  }

  public async promptAddStage(): Promise<void> {
    const sourcePick = await vscode.window.showQuickPick(
      [
        { label: 'document.types', description: 'Classes, Interfaces, Enums in active file' },
        { label: 'document.categories', description: 'Member kinds (Constructors, Fields, Methods, Static)' },
        { label: 'members.filtered', description: 'Filtered members belonging to selected types' },
        { label: 'document.symbols', description: 'All document symbols' },
        { label: 'relations.references', description: 'References across workspace' },
        { label: 'relations.callers', description: 'Incoming call hierarchy' },
        { label: 'relations.implementations', description: 'Implementations / subtypes' }
      ],
      { placeHolder: 'Select data source for new stage' }
    );

    if (!sourcePick) {
      return;
    }

    const title = await vscode.window.showInputBox({
      value: sourcePick.label.split('.').pop() || 'New Stage',
      prompt: 'Stage title'
    });

    const newStage: FacetStageConfig = {
      id: `stage-${Date.now()}`,
      title: title || 'New Stage',
      source: sourcePick.label as StageDataSource,
      displayMode: sourcePick.label === 'document.categories' ? 'chips' : 'list',
      allowMultiSelect: true,
      classSide: 'both',
      categoryFilter: MemberCategory.All,
      sortBy: 'name',
      revealOnSelect: true
    };

    this.pipeline.addStage(newStage);
  }

  public async promptSwitchPreset(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'Smalltalk System Browser', description: 'Types -> Categories -> Members -> Relations', preset: 'smalltalk' },
        { label: 'Implementors Browser', description: 'Selectors -> Implementations', preset: 'implementors' },
        { label: 'Senders (Callers) Browser', description: 'Target Selector -> Calling Methods', preset: 'senders' }
      ],
      { placeHolder: 'Select Predefined View Profile' }
    );

    if (picked) {
      this.pipeline.loadPreset(picked.preset as any);
    }
  }

  private renderHtml(stages: StageDataResult[], orientation: PipelineOrientation): string {
    const isHorizontal = orientation === 'horizontal';

    const stagesHtml = stages
      .map((stage, idx) => {
        const canMoveLeft = idx > 0;
        const canMoveRight = idx < stages.length - 1;

        let contentHtml = '';
        if (stage.displayMode === 'chips') {
          contentHtml = `
            <div class="chips-container">
              ${stage.items
                .map((item) => {
                  const isSelected = stage.selectedIds.includes(item.id);
                  return `
                    <button class="chip ${isSelected ? 'selected' : ''}"
                      onclick="selectItem('${stage.stageId}', '${item.id}', false)">
                      ${this.escape(item.label)}
                    </button>
                  `;
                })
                .join('')}
            </div>
          `;
        } else {
          contentHtml = `
            <div class="items-list">
              ${stage.items.length === 0 ? '<div class="empty-state">No items</div>' : ''}
              ${stage.items
                .map((item) => {
                  const isSelected = stage.selectedIds.includes(item.id);
                  const uri = item.rawNode?.uri?.toString() || '';
                  const range = item.rawNode?.range ? JSON.stringify(item.rawNode.range) : '{}';

                  return `
                    <div class="list-item ${isSelected ? 'selected' : ''}"
                      onclick="selectItem('${stage.stageId}', '${item.id}', event.shiftKey || event.metaKey, '${uri}', ${range})">
                      <span class="codicon codicon-${item.icon || 'symbol-misc'}"></span>
                      <span class="item-label">${this.escape(item.label)}</span>
                      ${item.detail ? `<span class="item-detail">${this.escape(item.detail)}</span>` : ''}
                    </div>
                  `;
                })
                .join('')}
            </div>
          `;
        }

        return `
          <div class="facet-stage ${isHorizontal ? 'column' : 'row'}">
            <div class="stage-header">
              <span class="stage-title">${this.escape(stage.title)}</span>
              <div class="stage-actions">
                ${canMoveLeft ? `<button title="Move Left/Up" onclick="moveStage('${stage.stageId}', 'backward')">‹</button>` : ''}
                ${canMoveRight ? `<button title="Move Right/Down" onclick="moveStage('${stage.stageId}', 'forward')">›</button>` : ''}
                <button title="Configure Stage" onclick="configureStage('${stage.stageId}')">⚙</button>
                <button title="Remove Stage" onclick="removeStage('${stage.stageId}')">✕</button>
              </div>
            </div>
            <div class="stage-body">
              ${contentHtml}
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Facet Deck</title>
        <style>
          :root {
            --bg: var(--vscode-sideBar-background, #1e1e1e);
            --fg: var(--vscode-sideBar-foreground, #cccccc);
            --border: var(--vscode-sideBar-border, #333333);
            --item-hover: var(--vscode-list-hoverBackground, #2a2d2e);
            --item-active: var(--vscode-list-activeSelectionBackground, #094771);
            --header-bg: var(--vscode-sideBarSectionHeader-background, #252526);
            --badge-bg: var(--vscode-badge-background, #4d4d4d);
            --button-bg: var(--vscode-button-secondaryBackground, #3a3d41);
            --button-fg: var(--vscode-button-secondaryForeground, #ffffff);
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: var(--bg);
            color: var(--fg);
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            font-size: var(--vscode-font-size, 12px);
            user-select: none;
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .toolbar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            background: var(--header-bg);
            border-bottom: 1px solid var(--border);
          }
          .toolbar button {
            background: var(--button-bg);
            color: var(--button-fg);
            border: 1px solid var(--border);
            padding: 3px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
          }
          .toolbar button:hover { opacity: 0.9; }
          .deck-container {
            flex: 1;
            display: flex;
            flex-direction: ${isHorizontal ? 'row' : 'column'};
            overflow: auto;
          }
          .facet-stage {
            display: flex;
            flex-direction: column;
            border-right: ${isHorizontal ? '1px solid var(--border)' : 'none'};
            border-bottom: ${isHorizontal ? 'none' : '1px solid var(--border)'};
            min-width: ${isHorizontal ? '180px' : 'auto'};
            flex: ${isHorizontal ? '1 1 200px' : 'none'};
            height: ${isHorizontal ? '100%' : 'auto'};
            max-height: ${isHorizontal ? 'none' : '260px'};
          }
          .stage-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background: var(--header-bg);
            font-weight: 600;
            font-size: 11px;
            border-bottom: 1px solid var(--border);
          }
          .stage-actions button {
            background: transparent;
            border: none;
            color: var(--fg);
            cursor: pointer;
            padding: 0 3px;
            font-size: 12px;
          }
          .stage-actions button:hover { color: #fff; }
          .stage-body {
            flex: 1;
            overflow-y: auto;
          }
          .chips-container {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding: 6px;
          }
          .chip {
            background: var(--button-bg);
            color: var(--button-fg);
            border: 1px solid var(--border);
            padding: 2px 7px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 10px;
          }
          .chip.selected {
            background: var(--item-active);
            border-color: var(--item-active);
          }
          .items-list {
            display: flex;
            flex-direction: column;
          }
          .list-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            cursor: pointer;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
          }
          .list-item:hover {
            background: var(--item-hover);
          }
          .list-item.selected {
            background: var(--item-active);
            color: #fff;
          }
          .item-label {
            font-size: 11px;
          }
          .item-detail {
            color: var(--vscode-descriptionForeground, #888888);
            font-size: 10px;
            margin-left: auto;
            padding-left: 6px;
          }
          .empty-state {
            padding: 12px;
            color: var(--vscode-descriptionForeground, #888888);
            font-style: italic;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="addStage()">+ Add Stage</button>
          <button onclick="toggleOrientation()">${isHorizontal ? '⮃ Vertical' : '⮂ Horizontal'}</button>
          <button onclick="switchPreset()">Profiles</button>
        </div>
        <div class="deck-container">
          ${stagesHtml}
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function selectItem(stageId, itemId, multi, uri, range) {
            vscode.postMessage({
              type: 'selectItem',
              stageId,
              itemId,
              multi: Boolean(multi),
              uri,
              range
            });
          }

          function moveStage(stageId, direction) {
            vscode.postMessage({ type: 'moveStage', stageId, direction });
          }

          function removeStage(stageId) {
            vscode.postMessage({ type: 'removeStage', stageId });
          }

          function configureStage(stageId) {
            vscode.postMessage({ type: 'configureStage', stageId });
          }

          function toggleOrientation() {
            vscode.postMessage({ type: 'toggleOrientation' });
          }

          function addStage() {
            vscode.postMessage({ type: 'addStage' });
          }

          function switchPreset() {
            vscode.postMessage({ type: 'switchPreset' });
          }
        </script>
      </body>
      </html>
    `;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
