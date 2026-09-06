import type { Manifest } from '../engine/types';
import type { ValuesPath } from '../model/ValuesDocument';

export type ResourceKey = string; // `${ns}/${kind}/${name}`
export type Family = 'workload' | 'network' | 'config' | 'security' | 'observability' | 'scaling' | 'storage' | 'external';
export type RemoveAction = { op: 'set'; path: ValuesPath; value: unknown } | { op: 'delete'; path: ValuesPath };
export type Provenance = { path: ValuesPath; owner?: ValuesPath; governingCondition: string; removeAction: RemoveAction[] };
export type GraphNode = {
  id: string;
  key: ResourceKey;
  kind: string;
  name: string;
  namespace: string;
  family: Family;
  external: boolean;
  conflict: boolean;
  hookBadge: boolean;
  manifest?: Manifest;
  provenance?: Provenance;
  warnings: string[];
};
export type EdgeRelation =
  | 'selects'
  | 'governed-by'
  | 'routes-to'
  | 'tls-from'
  | 'attaches-to'
  | 'produces'
  | 'issued-by'
  | 'scrapes'
  | 'protects'
  | 'guards'
  | 'scales'
  | 'binds'
  | 'runs-as'
  | 'mounts'
  | 'reads'
  | 'pulls-with'
  | 'precedes';
export type GraphEdge = { id: string; source: string; target: string; relation: EdgeRelation; label?: string };
export type GraphModel = { nodes: GraphNode[]; edges: GraphEdge[]; warnings: string[] };
