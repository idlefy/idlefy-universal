import { describe, it, expect } from 'vitest';
import { failText } from '../src/app/banner';

const CHAIN = `template: idlefy-universal/templates/configs.yaml: template: idlefy-universal/templates/configs.yaml:1:4: executing "idlefy-universal/templates/configs.yaml" at <include "idlefy-universal.validate" .>: error calling include: template: idlefy-universal/templates/_validation.tpl:568:4: executing "idlefy-universal.validate" at <include "idlefy-universal.validateStatefulSet" ...>: error calling include: template: idlefy-universal/templates/_validation.tpl:489:6: executing "idlefy-universal.validateRbac" at <fail (printf "%s %s: autoCreateRbac=true requires a ServiceAccount" $kind $name)>: error calling fail: StatefulSet cache: autoCreateRbac=true requires a ServiceAccount — set autoCreateServiceAccount: true or specify serviceAccountName`;

describe('failText', () => {
  it('keeps only what the chart itself said', () => {
    expect(failText(CHAIN)).toBe('StatefulSet cache: autoCreateRbac=true requires a ServiceAccount — set autoCreateServiceAccount: true or specify serviceAccountName');
  });
  it('takes the last marker, so a nested include cannot win', () => {
    expect(failText('a error calling fail: first b error calling fail: second')).toBe('second');
  });
  it('leaves a message without the marker alone, trimming nothing else', () => {
    const schemaErr = "values don't meet the specifications of the schema(s) in the following chart(s):\nidlefy-universal:\n- at '/jobs/app': additional properties 'autoCreateServiceAccount' not allowed";
    expect(failText(schemaErr)).toBe(schemaErr);
    expect(failText('idlefy-universal/templates/ingress.yaml: Map keys must be unique at line 24, column 1:')).toBe('idlefy-universal/templates/ingress.yaml: Map keys must be unique at line 24, column 1:');
    expect(failText('')).toBe('');
  });
});
