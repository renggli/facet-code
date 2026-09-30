import {
  type CallersPaneConfig,
  type ChangesPaneConfig,
  type DeclarationsPaneConfig,
  type DefinitionsPaneConfig,
  type DirectoriesPaneConfig,
  type FilesPaneConfig,
  type HierarchyPaneConfig,
  type ImplementationsPaneConfig,
  type PaneConfig,
  PaneRole,
  type ProblemsPaneConfig,
  type ReferencesPaneConfig,
  type SymbolsPaneConfig,
} from '../models/paneConfig';
import { ChangesPaneDefinition } from './definitions/changesPane';
import { DirectoriesPaneDefinition } from './definitions/directoriesPane';
import { FilesPaneDefinition } from './definitions/filesPane';
import { HierarchyPaneDefinition } from './definitions/hierarchyPane';
import { ProblemsPaneDefinition } from './definitions/problemsPane';
import {
  CallersPaneDefinition,
  DeclarationsPaneDefinition,
  DefinitionsPaneDefinition,
  ImplementationsPaneDefinition,
  ReferencesPaneDefinition,
} from './definitions/relationsPane';
import { SymbolsPaneDefinition } from './definitions/symbolsPane';
import type { PaneDefinition } from './paneDefinition';

export interface PaneRoleConfigMap {
  [PaneRole.Files]: FilesPaneConfig;
  [PaneRole.Directories]: DirectoriesPaneConfig;
  [PaneRole.Symbols]: SymbolsPaneConfig;
  [PaneRole.Definitions]: DefinitionsPaneConfig;
  [PaneRole.Declarations]: DeclarationsPaneConfig;
  [PaneRole.Implementations]: ImplementationsPaneConfig;
  [PaneRole.References]: ReferencesPaneConfig;
  [PaneRole.Problems]: ProblemsPaneConfig;
  [PaneRole.Changes]: ChangesPaneConfig;
  [PaneRole.Callers]: CallersPaneConfig;
  [PaneRole.Hierarchy]: HierarchyPaneConfig;
}

export class PaneRegistry {
  private readonly definitions = new Map<PaneRole, PaneDefinition<PaneConfig, unknown>>();

  public register<TConfig extends PaneConfig, TItem>(definition: PaneDefinition<TConfig, TItem>): void {
    this.definitions.set(definition.role, definition as unknown as PaneDefinition<PaneConfig, unknown>);
  }

  public get<R extends PaneRole>(role: R): PaneDefinition<PaneRoleConfigMap[R], unknown>;
  public get<TConfig extends PaneConfig = PaneConfig, TItem = unknown>(role: PaneRole): PaneDefinition<TConfig, TItem>;
  public get(role: PaneRole): PaneDefinition<PaneConfig, unknown> {
    const def = this.definitions.get(role);
    if (!def) {
      throw new Error(`No pane definition registered for role: "${role}"`);
    }
    return def;
  }

  public tryGet<R extends PaneRole>(role: R): PaneDefinition<PaneRoleConfigMap[R], unknown> | undefined;
  public tryGet<TConfig extends PaneConfig = PaneConfig, TItem = unknown>(
    role: PaneRole,
  ): PaneDefinition<TConfig, TItem> | undefined;
  public tryGet(role: PaneRole): PaneDefinition<PaneConfig, unknown> | undefined {
    return this.definitions.get(role);
  }

  public getAll(): PaneDefinition<PaneConfig, unknown>[] {
    return Array.from(this.definitions.values());
  }

  public has(role: PaneRole): boolean {
    return this.definitions.has(role);
  }
}

export function createDefaultPaneRegistry(): PaneRegistry {
  const registry = new PaneRegistry();
  registry.register(new DirectoriesPaneDefinition());
  registry.register(new FilesPaneDefinition());
  registry.register(new SymbolsPaneDefinition());
  registry.register(new HierarchyPaneDefinition());
  registry.register(new DefinitionsPaneDefinition());
  registry.register(new DeclarationsPaneDefinition());
  registry.register(new ImplementationsPaneDefinition());
  registry.register(new ReferencesPaneDefinition());
  registry.register(new CallersPaneDefinition());
  registry.register(new ProblemsPaneDefinition());
  registry.register(new ChangesPaneDefinition());
  return registry;
}
