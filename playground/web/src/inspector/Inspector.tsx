import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument, ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { schemaAt, classify, resolve, type SchemaNode } from './schema';
import { buildFields, type Field } from './form';
import { FieldList, FieldRow } from './fields';
import { AutoCreated } from './AutoCreated';
import { inspectTarget, secondaryById } from './target';
import { SECONDARY, type SecondaryId } from '../graph/secondary';
import { WORKLOAD_SECTIONS, RELEASE_TITLES, partition } from './sections';

const RELEASE_SECTIONS = ['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs'];
const KIND_LABEL: Record<string, string> = { deployments: 'Deployment', statefulSets: 'StatefulSet', daemonSets: 'DaemonSet', jobs: 'Job', cronJobs: 'CronJob' };
// Flags the switch list owns and the config blocks behind them: reached through the list's "open ›",
// never as plain fields (spec 2026-09-07 §5.2).
const OWNED_FLAGS = new Set(SECONDARY.map((s) => `autoCreate${s.id[0].toUpperCase()}${s.id.slice(1)}`));
const ALL_BLOCKS = new Set<string>(SECONDARY.map((s) => s.id));
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

const TAIL: Record<SecondaryId, string> = { service: 'service', ingress: 'ingress', httpRoute: 'httpRoute', certificate: 'certificate', hpa: 'hpa', migrations: 'migrations', pdb: 'pdb', serviceMonitor: 'serviceMonitor', networkPolicy: 'networkPolicy', rbac: 'rbac', serviceAccount: 'serviceAccount' };
const sameP = (a: ValuesPath | undefined, b: ValuesPath) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
/** Graph node produced by the secondary block of `base` (first match in graph order; for rbac either Role or RoleBinding, both open the same block). */
function nodeFor(nodes: GraphNode[], base: ValuesPath, id: SecondaryId): string | null {
  const hit = nodes.find((n) => n.manifest && sameP(n.provenance?.owner, base) && n.provenance!.path.length === 3 && String(n.provenance!.path[2]) === TAIL[id]);
  return hit?.id ?? null;
}

export function Inspector(p: {
  node: GraphNode; root: SchemaNode; doc: ValuesDocument; tier: Tier; nodes: GraphNode[];
  onEdit: (ops: EditOp[]) => void; onSelect: (id: string) => void; disabled: boolean;
}): ReactElement {
  const t = inspectTarget(p.node, p.root);
  const edit = p.disabled ? () => {} : p.onEdit;
  const rootValue = p.doc.valueAt([]);
  const all = (isObj(rootValue) ? rootValue : {}) as Record<string, unknown>;
  const notice = p.disabled && <p className="banner-inline">Fix the YAML syntax error in the editor to edit here.</p>;

  const workloadPanel = (base: ValuesPath, highlight?: SecondaryId) => {
    const kindKey = String(base[0]), name = String(base[1]);
    const cfg = p.doc.valueAt(base);
    const node = schemaAt(p.root, base)!;
    const keys = Object.keys(resolve(p.root, node).properties ?? {}).filter((k) => !OWNED_FLAGS.has(k) && !ALL_BLOCKS.has(k));
    const parts = partition(keys, WORKLOAD_SECTIONS);
    const sectionEl = (id: string) => {
      const part = parts.find((x) => x.section.id === id);
      if (!part) return null;
      const { section } = part;
      if (section.advanced && p.tier !== 'advanced') {
        return <div key={id} className="sec adv"><h3>{section.title} <span className="more">hidden · turn on “show all fields”</span></h3></div>;
      }
      const mine = new Set(part.keys);
      // Metadata keys are all advanced-tier: on the basic tier with nothing set the section would be a heading over "No fields here."
      if (buildFields(p.root, node, base, cfg, p.tier, { hide: (k) => !mine.has(k) }).length === 0) return null;
      return (
        <div key={id} className={`sec ${section.advanced ? 'adv' : ''}`}>
          <h3>{section.title}</h3>
          <FieldList root={p.root} node={node} basePath={base} value={cfg} tier={p.tier} onEdit={edit} hide={(k) => !mine.has(k)} order={part.keys} />
        </div>
      );
    };
    return (
      <fieldset disabled={p.disabled}>
        {sectionEl('workload')}
        {sectionEl('containers')}
        <div className="sec">
          <h3>Auto-created resources</h3>
          <AutoCreated kindKey={kindKey} name={name} base={base} cfg={isObj(cfg) ? cfg : {}} disabled={p.disabled} highlight={highlight} onEdit={edit}
            nodeFor={(id) => nodeFor(p.nodes, base, id)} onSelect={p.onSelect}
            renderBlock={(id) => { const bn = schemaAt(p.root, [...base, id]); return bn ? <FieldList root={p.root} node={bn} basePath={[...base, id]} value={p.doc.valueAt([...base, id])} tier={p.tier} onEdit={edit} /> : null; }} />
        </div>
        {sectionEl('metadata')}
        {sectionEl('placement')}
        {sectionEl('other')}
      </fieldset>
    );
  };

  // Property-shaped release sections list their fields; `secretRefs` is a bare additionalProperties
  // map that buildFields cannot walk, so it renders through its own widget.
  const releaseSection = (k: string): ReactElement => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') return <FieldList root={p.root} node={node} basePath={[k]} value={all[k]} tier={p.tier} onEdit={edit} hide={(x) => OWNED_FLAGS.has(x)} />;
    const field: Field = {
      key: k, path: [k], label: k, description: typeof node.description === 'string' ? node.description.trim() : undefined,
      widget, schema: node, value: all[k], present: all[k] !== undefined, required: false,
      tier: node['x-ui-tier'] === 'basic' ? 'basic' : 'advanced',
    };
    return <FieldRow root={p.root} field={field} tier={p.tier} onEdit={edit} />;
  };

  let body: ReactElement;
  switch (t.kind) {
    case 'none': body = <p className="muted prov">{t.reason}</p>; break;
    case 'release':
      body = (
        <fieldset disabled={p.disabled}>
          {RELEASE_SECTIONS.map((k) => (
            <div key={k} className="sec">
              <h3>{RELEASE_TITLES[k] ?? k} <span className="k">{k}</span></h3>
              {releaseSection(k)}
            </div>
          ))}
        </fieldset>
      );
      break;
    case 'workload': body = workloadPanel(t.path); break;
    case 'owner-only': {
      const owner = t.owner;
      body = (
        <>
          <p className="prov">Configured on {KIND_LABEL[String(owner[0])] ?? owner[0]} {String(owner[1])} — see <b>{secondaryById(t.secondary).label}</b> below.</p>
          {workloadPanel(owner, t.secondary)}
        </>
      );
      break;
    }
    case 'entity': {
      const owner = p.node.provenance?.owner;
      body = (
        <>
          {owner && <p className="prov">Part of {KIND_LABEL[String(owner[0])] ?? owner[0]} {String(owner[1])} (values: <code>{t.path.join('.')}</code>).</p>}
          <fieldset disabled={p.disabled}>
            <div className="sec">
              <FieldList root={p.root} node={schemaAt(p.root, t.path)!} basePath={t.path} value={p.doc.valueAt(t.path)} tier={p.tier} onEdit={edit} />
            </div>
          </fieldset>
        </>
      );
      break;
    }
  }
  const bodyKey = t.kind === 'release' ? 'release' : t.kind === 'none' ? 'none' : t.kind === 'owner-only' ? t.owner.join('.') : t.path.join('.');
  return (
    <div className="inspector" key={bodyKey}>
      {notice}
      {body}
    </div>
  );
}
