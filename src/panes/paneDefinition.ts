import type * as vscode from 'vscode';
import type { FacetCoordinator } from '../coordinator/facetCoordinator';
import type { PaneConfig, PaneInputSource, PaneRole, SortOption } from '../models/paneConfig';
import type { FacetSymbolNode } from '../models/symbolNode';

export interface PaneOutput {
  uris?: vscode.Uri[];
  symbols?: FacetSymbolNode[];
  items?: unknown[];
}

export interface PaneExecutionContext<TConfig extends PaneConfig = PaneConfig> {
  config: TConfig;
  slotId: string;
  coordinator: FacetCoordinator;
  upstreamOutput: PaneOutput;
  activeEditor?: vscode.TextEditor;
  cancellationToken?: vscode.CancellationToken;
}

export interface PaneCapabilities {
  readonly supportedInputs: readonly PaneInputSource[];
  readonly supportedSorts: readonly SortOption[];
  readonly hasTreeToggle: boolean;
  readonly hasFilter: boolean;
}

export interface PaneDefinition<TConfig extends PaneConfig = PaneConfig, TItem = unknown> {
  readonly role: PaneRole;
  readonly title: string;
  readonly icon: string;
  readonly description: string;
  readonly capabilities: PaneCapabilities;

  defaultConfig(slotId: string): TConfig;

  getChildren(context: PaneExecutionContext<TConfig>, element?: TItem): Promise<TItem[]>;
  getTreeItem(item: TItem, context: PaneExecutionContext<TConfig>): vscode.TreeItem;
  getParent?(item: TItem, context: PaneExecutionContext<TConfig>): TItem | undefined;

  getOutput(items: readonly TItem[], context: PaneExecutionContext<TConfig>): PaneOutput;
  configureFilter?(config: TConfig, context: PaneExecutionContext<TConfig>): Promise<boolean>;
}
