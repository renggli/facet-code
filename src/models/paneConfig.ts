import { MemberCategory, ClassSide, LayoutMode } from './symbolNode';
import { TypesScope } from '../providers/typesTreeProvider';
import { RelationsMode } from '../providers/relationsTreeProvider';

export type PaneRole = 'types' | 'categories' | 'members' | 'relations';

export interface PaneConfig {
  id: string; // e.g. 'facet.pane.1'
  title: string;
  role: PaneRole;
  scope: TypesScope;
  side: ClassSide;
  category: MemberCategory;
  layout: LayoutMode;
  relationsMode: RelationsMode;
  visible: boolean;
}

export function createDefaultPanes(): PaneConfig[] {
  return [
    {
      id: 'facet.pane.1',
      title: 'Types',
      role: 'types',
      scope: 'file',
      side: 'instance',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'references',
      visible: true
    },
    {
      id: 'facet.pane.2',
      title: 'Categories',
      role: 'categories',
      scope: 'file',
      side: 'instance',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'references',
      visible: true
    },
    {
      id: 'facet.pane.3',
      title: 'Members',
      role: 'members',
      scope: 'file',
      side: 'instance',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'references',
      visible: true
    },
    {
      id: 'facet.pane.4',
      title: 'Relations',
      role: 'relations',
      scope: 'file',
      side: 'instance',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'references',
      visible: true
    },
    {
      id: 'facet.pane.5',
      title: 'Pane 5',
      role: 'types',
      scope: 'project',
      side: 'both',
      category: MemberCategory.All,
      layout: 'list',
      relationsMode: 'callers',
      visible: false
    },
    {
      id: 'facet.pane.6',
      title: 'Pane 6',
      role: 'members',
      scope: 'file',
      side: 'class',
      category: MemberCategory.All,
      layout: 'tree',
      relationsMode: 'implementations',
      visible: false
    }
  ];
}
