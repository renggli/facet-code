import { ClassSide, MemberCategory } from './symbolNode';

export type StageDisplayMode = 'list' | 'tree' | 'chips';
export type PipelineOrientation = 'horizontal' | 'vertical';

export type StageDataSource =
  | 'document.types'
  | 'document.categories'
  | 'document.symbols'
  | 'members.filtered'
  | 'relations.references'
  | 'relations.callers'
  | 'relations.implementations';

export interface FacetStageConfig {
  id: string;
  title: string;
  source: StageDataSource;
  displayMode: StageDisplayMode;
  allowMultiSelect: boolean;
  classSide: ClassSide;
  categoryFilter: MemberCategory;
  sortBy: 'name' | 'position' | 'kind';
  revealOnSelect: boolean;
}

export interface FacetPipelineConfig {
  id: string;
  name: string;
  orientation: PipelineOrientation;
  stages: FacetStageConfig[];
}

export function createDefaultSmalltalkPipeline(): FacetPipelineConfig {
  return {
    id: 'smalltalk-system',
    name: 'Smalltalk System Browser',
    orientation: 'horizontal',
    stages: [
      {
        id: 'stage-types',
        title: 'Types',
        source: 'document.types',
        displayMode: 'list',
        allowMultiSelect: true,
        classSide: 'instance',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: false
      },
      {
        id: 'stage-categories',
        title: 'Categories',
        source: 'document.categories',
        displayMode: 'chips',
        allowMultiSelect: false,
        classSide: 'instance',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: false
      },
      {
        id: 'stage-members',
        title: 'Members',
        source: 'members.filtered',
        displayMode: 'list',
        allowMultiSelect: true,
        classSide: 'instance',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: true
      },
      {
        id: 'stage-relations',
        title: 'Relations',
        source: 'relations.references',
        displayMode: 'tree',
        allowMultiSelect: false,
        classSide: 'both',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: true
      }
    ]
  };
}

export function createImplementorsPipeline(): FacetPipelineConfig {
  return {
    id: 'implementors',
    name: 'Implementors Browser',
    orientation: 'horizontal',
    stages: [
      {
        id: 'stage-symbols',
        title: 'Selectors',
        source: 'document.symbols',
        displayMode: 'list',
        allowMultiSelect: false,
        classSide: 'both',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: false
      },
      {
        id: 'stage-implementations',
        title: 'Implementations',
        source: 'relations.implementations',
        displayMode: 'tree',
        allowMultiSelect: false,
        classSide: 'both',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: true
      }
    ]
  };
}

export function createSendersPipeline(): FacetPipelineConfig {
  return {
    id: 'senders',
    name: 'Senders Browser',
    orientation: 'horizontal',
    stages: [
      {
        id: 'stage-symbols',
        title: 'Target Selector',
        source: 'document.symbols',
        displayMode: 'list',
        allowMultiSelect: false,
        classSide: 'both',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: false
      },
      {
        id: 'stage-callers',
        title: 'Calling Methods (Senders)',
        source: 'relations.callers',
        displayMode: 'tree',
        allowMultiSelect: false,
        classSide: 'both',
        categoryFilter: MemberCategory.All,
        sortBy: 'name',
        revealOnSelect: true
      }
    ]
  };
}
