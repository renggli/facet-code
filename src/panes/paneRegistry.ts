import type { PaneRole } from '../models/paneConfig';
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

export class PaneRegistry {
  private readonly definitions = new Map<PaneRole, PaneDefinition<any, any>>();

  public register(definition: PaneDefinition<any, any>): void {
    this.definitions.set(definition.role, definition);
  }

  public get(role: PaneRole): PaneDefinition<any, any> {
    const def = this.definitions.get(role);
    if (!def) {
      throw new Error(`No pane definition registered for role: "${role}"`);
    }
    return def;
  }

  public tryGet(role: PaneRole): PaneDefinition<any, any> | undefined {
    return this.definitions.get(role);
  }

  public getAll(): PaneDefinition<any, any>[] {
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
