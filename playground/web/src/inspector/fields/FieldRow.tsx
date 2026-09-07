import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { BooleanField } from './BooleanField';
import { NumberField } from './NumberField';
import { TextField } from './TextField';
import { ListField } from './ListField';
import { KeyValueField } from './KeyValueField';
import { YamlField } from './YamlField';
import { MapSection } from './MapSection';
import { ObjectSection } from './ObjectSection';

export function FieldRow(p: FieldProps): ReactElement {
  const { field } = p;
  const id = field.path.join('.');
  const control = (() => {
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
  const block = field.widget.kind === 'map' || field.widget.kind === 'object' || field.widget.kind === 'keyvalue' || field.widget.kind === 'yaml' || field.widget.kind === 'list';
  return (
    <div className={`field ${block ? 'block' : 'inline'} tier-${field.tier} ${field.present ? 'present' : 'absent'}`}>
      <div className="field-head">
        <label htmlFor={id} title={field.description}>{field.label}{field.required && <span className="req" title="required">*</span>}</label>
        {field.present && block && (
          <button type="button" className="clear" aria-label={`clear ${id}`} title="Remove this block from values.yaml" onClick={() => p.onEdit([{ op: 'delete', path: field.path }])}>×</button>
        )}
      </div>
      {control}
      {field.description && <p className="field-desc">{field.description.split('\n')[0]}</p>}
    </div>
  );
}
