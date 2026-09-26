import * as vscode from 'vscode';
import {
  FacetPipelineConfig,
  FacetStageConfig,
  PipelineOrientation,
  createDefaultSmalltalkPipeline,
  createImplementorsPipeline,
  createSendersPipeline
} from '../models/pipelineConfig';
import { FacetSymbolNode, MemberCategory, filterMembers, unionMembers, isTypeKind } from '../models/symbolNode';

export interface StageDataResult {
  stageId: string;
  title: string;
  displayMode: string;
  items: StageItem[];
  selectedIds: string[];
}

export interface StageItem {
  id: string;
  label: string;
  detail?: string;
  icon?: string;
  isStatic?: boolean;
  category?: MemberCategory;
  rawNode?: FacetSymbolNode;
  children?: StageItem[];
}

export class FacetPipeline {
  private _onDidChangePipeline = new vscode.EventEmitter<FacetPipelineConfig>();
  readonly onDidChangePipeline = this._onDidChangePipeline.event;

  private config: FacetPipelineConfig;
  private stageSelections = new Map<string, string[]>();

  constructor(initialConfig?: FacetPipelineConfig) {
    this.config = initialConfig || createDefaultSmalltalkPipeline();
  }

  public getConfig(): FacetPipelineConfig {
    return this.config;
  }

  public getStages(): FacetStageConfig[] {
    return this.config.stages;
  }

  public getOrientation(): PipelineOrientation {
    return this.config.orientation;
  }

  public toggleOrientation(): PipelineOrientation {
    this.config.orientation = this.config.orientation === 'horizontal' ? 'vertical' : 'horizontal';
    this._onDidChangePipeline.fire(this.config);
    return this.config.orientation;
  }

  public addStage(stage: FacetStageConfig, index?: number): void {
    if (index !== undefined && index >= 0 && index <= this.config.stages.length) {
      this.config.stages.splice(index, 0, stage);
    } else {
      this.config.stages.push(stage);
    }
    this._onDidChangePipeline.fire(this.config);
  }

  public removeStage(stageId: string): boolean {
    const idx = this.config.stages.findIndex((s) => s.id === stageId);
    if (idx !== -1) {
      this.config.stages.splice(idx, 1);
      this.stageSelections.delete(stageId);
      this._onDidChangePipeline.fire(this.config);
      return true;
    }
    return false;
  }

  public moveStage(stageId: string, direction: 'forward' | 'backward'): boolean {
    const idx = this.config.stages.findIndex((s) => s.id === stageId);
    if (idx === -1) {
      return false;
    }

    const targetIdx = direction === 'forward' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= this.config.stages.length) {
      return false;
    }

    const [removed] = this.config.stages.splice(idx, 1);
    this.config.stages.splice(targetIdx, 0, removed);
    this._onDidChangePipeline.fire(this.config);
    return true;
  }

  public updateStage(stageId: string, partial: Partial<FacetStageConfig>): boolean {
    const stage = this.config.stages.find((s) => s.id === stageId);
    if (!stage) {
      return false;
    }

    Object.assign(stage, partial);
    this._onDidChangePipeline.fire(this.config);
    return true;
  }

  public setStageSelection(stageId: string, selectedIds: string[]): void {
    this.stageSelections.set(stageId, selectedIds);
  }

  public getStageSelection(stageId: string): string[] {
    return this.stageSelections.get(stageId) || [];
  }

  public loadPreset(name: 'smalltalk' | 'implementors' | 'senders'): void {
    switch (name) {
      case 'implementors':
        this.config = createImplementorsPipeline();
        break;
      case 'senders':
        this.config = createSendersPipeline();
        break;
      default:
        this.config = createDefaultSmalltalkPipeline();
        break;
    }
    this.stageSelections.clear();
    this._onDidChangePipeline.fire(this.config);
  }

  public evaluatePipeline(allSymbols: FacetSymbolNode[]): StageDataResult[] {
    const results: StageDataResult[] = [];
    let currentTypes: FacetSymbolNode[] = [];
    let activeCategory = MemberCategory.All;

    for (let i = 0; i < this.config.stages.length; i++) {
      const stage = this.config.stages[i];
      const selectedIds = this.getStageSelection(stage.id);

      switch (stage.source) {
        case 'document.types': {
          const typeNodes = this.extractTypes(allSymbols);
          const items: StageItem[] = typeNodes.map((t) => ({
            id: t.name,
            label: t.name,
            detail: t.detail,
            icon: 'symbol-class',
            rawNode: t
          }));

          // Track downstream types
          if (selectedIds.length > 0) {
            currentTypes = typeNodes.filter((t) => selectedIds.includes(t.name));
          } else if (typeNodes.length > 0) {
            currentTypes = [typeNodes[0]];
          } else {
            currentTypes = [];
          }

          results.push({
            stageId: stage.id,
            title: stage.title,
            displayMode: stage.displayMode,
            items,
            selectedIds
          });
          break;
        }

        case 'document.categories': {
          const categories: { id: MemberCategory; label: string }[] = [
            { id: MemberCategory.All, label: 'All' },
            { id: MemberCategory.Constructors, label: 'Constructors' },
            { id: MemberCategory.Fields, label: 'Fields' },
            { id: MemberCategory.InstanceMethods, label: 'Methods' },
            { id: MemberCategory.StaticMethods, label: 'Static' },
            { id: MemberCategory.Accessors, label: 'Accessors' }
          ];

          if (selectedIds.length > 0) {
            activeCategory = selectedIds[0] as MemberCategory;
          } else {
            activeCategory = stage.categoryFilter;
          }

          const items: StageItem[] = categories.map((c) => ({
            id: c.id,
            label: c.label,
            category: c.id
          }));

          results.push({
            stageId: stage.id,
            title: stage.title,
            displayMode: stage.displayMode,
            items,
            selectedIds: [activeCategory]
          });
          break;
        }

        case 'members.filtered': {
          const rawMembers = unionMembers(currentTypes);
          const filtered = filterMembers(rawMembers, activeCategory, stage.classSide);

          if (stage.sortBy === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
          }

          const items: StageItem[] = filtered.map((m) => ({
            id: `${m.name}:${m.kind}`,
            label: m.name,
            detail: m.detail,
            icon: m.isStatic ? 'symbol-constant' : 'symbol-method',
            isStatic: m.isStatic,
            category: m.category,
            rawNode: m
          }));

          results.push({
            stageId: stage.id,
            title: `${stage.title} (${filtered.length})`,
            displayMode: stage.displayMode,
            items,
            selectedIds
          });
          break;
        }

        case 'document.symbols':
        default: {
          const items: StageItem[] = allSymbols.map((s) => ({
            id: s.name,
            label: s.name,
            detail: s.detail,
            icon: 'symbol-misc',
            rawNode: s
          }));

          results.push({
            stageId: stage.id,
            title: stage.title,
            displayMode: stage.displayMode,
            items,
            selectedIds
          });
          break;
        }
      }
    }

    return results;
  }

  private extractTypes(nodes: FacetSymbolNode[]): FacetSymbolNode[] {
    const result: FacetSymbolNode[] = [];
    const walk = (list: FacetSymbolNode[]) => {
      for (const node of list) {
        if (isTypeKind(node.kind)) {
          result.push(node);
        }
        if (node.children && node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(nodes);
    return result;
  }
}
