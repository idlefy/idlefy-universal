import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { firstSentence } from '../form';
import { resolve, deref, type SchemaNode } from '../schema';
import { BooleanField } from './BooleanField';
import { NumberField } from './NumberField';
import { TextField } from './TextField';
import { ListField } from './ListField';
import { KeyValueField } from './KeyValueField';
import { YamlField } from './YamlField';
import { MapSection } from './MapSection';
import { ObjectSection } from './ObjectSection';
import { ContainersField } from './ContainersField';
import { ResourcesField } from './ResourcesField';
import { PortsTable } from './PortsTable';

/** `bare`: the caller already shows the label (a section heading) — render only description + control, no frame. */
export function FieldRow(p: FieldProps & { bare?: boolean }): ReactElement {
  const { field, root } = p;
  const id = field.path.join('.');
  const refName = (n: SchemaNode | undefined) => (n ? (deref(root, n) ?? n)['x-ref-name'] : undefined);
  const r = resolve(root, field.schema);
  const itemRef = refName(r.additionalProperties as SchemaNode | undefined);
  const special =
    (field.key === 'containers' || field.key === 'initContainers') && itemRef === 'ContainerSpec' ? 'containers'
    : field.key === 'ports' && itemRef === 'PortSpec' ? 'ports'
    : field.schema['x-ref-name'] === 'ResourceRequirements' ? 'resources' : null;
  const control = (() => {
    if (special === 'containers') return <ContainersField {...p} />;
    if (special === 'ports') return <PortsTable {...p} />;
    if (special === 'resources') return <ResourcesField {...p} />;
    switch (field.widget.kind) {
      case 'boolean': return <BooleanField {...p} />;
      case 'number': return <NumberField {...p} />;
      case 'string': return <TextField {...p} />;
      case 'list': return <ListField {...p} />;
      case 'keyvalue': return <KeyValueField {...p} />;
      case 'map': return <MapSection {...p} />;
      case 'object': return <ObjectSection {...p} />;
      case 'yaml': return <YamlField {...p} />;
    }
  })();
  const block = special !== null || field.widget.kind === 'map' || field.widget.kind === 'object' || field.widget.kind === 'keyvalue' || field.widget.kind === 'yaml' || field.widget.kind === 'list';
  return (
    <div className={`field ${block ? 'block' : 'inline'} ${p.bare ? 'bare' : ''} ${special ? `sp-${special}` : ''} tier-${field.tier} ${field.present ? 'present' : 'absent'}`}>
      {!p.bare && <div className="field-head">
        <label htmlFor={id} title={field.description}>{field.label}{field.required && <span className="req" title="required">*</span>}</label>
        {field.present && block && (
          <button type="button" className="clear" aria-label={`clear ${id}`} title="Remove this block from values.yaml" onClick={() => p.onEdit([{ op: 'delete', path: field.path }])}>×</button>
        )}
      </div>}
      {/* block fields read label → what it is → the control; inline rows keep the hint under the control */}
      {block && field.description && <p className="field-desc">{firstSentence(field.description)}</p>}
      {control}
      {!block && field.description && <p className="field-desc">{firstSentence(field.description)}</p>}
    </div>
  );
}
