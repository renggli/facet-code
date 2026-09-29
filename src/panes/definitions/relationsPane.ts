import * as vscode from 'vscode';
import {
  ALL_SYMBOL_FILTER_OPTIONS,
  createDefaultFilters,
  matchesPaneFilters,
  type PaneConfig,
  type PaneFilters,
  type PaneRole,
} from '../../models/paneConfig';
import type { FacetSymbolNode } from '../../models/symbolNode';
import type { RelationItem } from '../../providers/relationsTreeProvider';
import type { PaneCapabilities, PaneDefinition, PaneExecutionContext, PaneOutput } from '../paneDefinition';

export type RelationMode = 'references' | 'callers' | 'implementations' | 'definitions' | 'declarations';

export type FilterableRelationConfig = PaneConfig & {
  filters?: PaneFilters;
};

export abstract class BaseRelationPaneDefinition implements PaneDefinition<PaneConfig, RelationItem> {
  public abstract readonly role: PaneRole;
  public abstract readonly title: string;
  public abstract readonly icon: string;
  public abstract readonly description: string;
  public abstract readonly mode: RelationMode;

  public readonly capabilities: PaneCapabilities = {
    supportedInputs: ['previousPane'],
    supportedSorts: ['position', 'name'],
    hasTreeToggle: false,
    hasFilter: true,
  };

  public defaultConfig(slotId: string): PaneConfig {
    return {
      id: slotId,
      role: this.role,
      title: this.title,
      visible: true,
      inputSource: 'previousPane',
      sort: 'position',
      filters: createDefaultFilters(),
    } as PaneConfig;
  }

  public async getChildren(
    context: PaneExecutionContext<PaneConfig>,
    _element?: RelationItem,
  ): Promise<RelationItem[]> {
    const config = context.config;
    let targets: FacetSymbolNode[] = [];

    const prevSel =
      context.upstreamOutput.symbols && context.upstreamOutput.symbols.length > 0
        ? context.upstreamOutput.symbols
        : context.upstreamOutput.items && context.upstreamOutput.items.length > 0
          ? context.upstreamOutput.items
          : context.coordinator.getPreviousPaneSelection(config.id);

    targets = prevSel.filter((s): s is FacetSymbolNode => {
      if (!s || typeof s !== 'object') {
        return false;
      }
      const maybeNode = s as Partial<FacetSymbolNode>;
      return Boolean(maybeNode.name && maybeNode.uri);
    });

    if (targets.length === 0) {
      const prevPane = context.coordinator.getPreviousPane(config.id);
      if (prevPane) {
        const prevItems = await context.coordinator.getSlotChildren(prevPane);
        if (prevItems.length > 0 && (prevItems[0] as Partial<FacetSymbolNode>).uri) {
          targets = [prevItems[0] as FacetSymbolNode];
        }
      }
    }

    if (context.cancellationToken?.isCancellationRequested || targets.length === 0) {
      return [];
    }

    const raw = await context.coordinator.relationsProvider.fetchRelationsForNodes(
      targets,
      this.mode,
      context.cancellationToken,
    );
    const filterable = config as FilterableRelationConfig;
    const filters = filterable.filters;
    const filtered = raw.filter((item) => matchesPaneFilters(item, filters));

    return filtered.sort((a, b) => {
      if (config.sort === 'name') {
        return a.label.localeCompare(b.label);
      }
      const uriDiff = a.uri.fsPath.localeCompare(b.uri.fsPath);
      if (uriDiff !== 0) {
        return uriDiff;
      }
      const lineDiff = a.range.start.line - b.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return a.range.start.character - b.range.start.character;
    });
  }

  public getTreeItem(item: RelationItem, context: PaneExecutionContext<PaneConfig>): vscode.TreeItem {
    return context.coordinator.relationsProvider.getTreeItem(item);
  }

  public getOutput(items: readonly RelationItem[]): PaneOutput {
    return {
      items: Array.from(items),
      uris: items.map((i) => i.uri),
    };
  }

  public async configureFilter(config: PaneConfig): Promise<boolean> {
    const cfg = config as FilterableRelationConfig;
    if (!cfg.filters) {
      cfg.filters = {};
    }
    const currentFilters = cfg.filters;
    const filterOptions = ALL_SYMBOL_FILTER_OPTIONS.map((opt) => ({
      label: opt.label,
      key: opt.key,
      picked: currentFilters[opt.key] !== false,
    }));

    const selected = await vscode.window.showQuickPick(filterOptions, {
      canPickMany: true,
      placeHolder: 'Toggle symbol filters across 26 kinds (checked = visible)',
    });

    if (selected) {
      const selectedKeys = new Set(selected.map((s) => s.key));
      for (const opt of filterOptions) {
        currentFilters[opt.key] = selectedKeys.has(opt.key);
      }
      return true;
    }
    return false;
  }
}

export class DefinitionsPaneDefinition extends BaseRelationPaneDefinition {
  public readonly role = 'definitions';
  public readonly title = 'Definitions';
  public readonly icon = 'references';
  public readonly description = 'Symbol definition targets';
  public readonly mode = 'definitions' as const;
}

export class DeclarationsPaneDefinition extends BaseRelationPaneDefinition {
  public readonly role = 'declarations';
  public readonly title = 'Declarations';
  public readonly icon = 'references';
  public readonly description = 'Symbol declaration locations';
  public readonly mode = 'declarations' as const;
}

export class ImplementationsPaneDefinition extends BaseRelationPaneDefinition {
  public readonly role = 'implementations';
  public readonly title = 'Implementations';
  public readonly icon = 'references';
  public readonly description = 'Interface or abstract method implementations';
  public readonly mode = 'implementations' as const;
}

export class ReferencesPaneDefinition extends BaseRelationPaneDefinition {
  public readonly role = 'references';
  public readonly title = 'References';
  public readonly icon = 'references';
  public readonly description = 'Symbol references across workspace';
  public readonly mode = 'references' as const;
}

export class CallersPaneDefinition extends BaseRelationPaneDefinition {
  public readonly role = 'callers';
  public readonly title = 'Callers';
  public readonly icon = 'call-incoming';
  public readonly description = 'Incoming calls to selected functions and methods';
  public readonly mode = 'callers' as const;
}
