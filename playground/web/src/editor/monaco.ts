import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import YamlWorker from 'monaco-yaml/yaml.worker?worker';
import { configureMonacoYaml } from 'monaco-yaml';

let done = false;
export function setupMonaco(schema: object) {
  if (done) return monaco;
  (self as any).MonacoEnvironment = { getWorker: (_: unknown, label: string) => (label === 'yaml' ? new YamlWorker() : new EditorWorker()) };
  configureMonacoYaml(monaco, {
    enableSchemaRequest: false, hover: true, completion: true, validate: true, format: { enable: true },
    schemas: [{ uri: 'inmemory://idlefy/values.schema.json', fileMatch: ['values.yaml'], schema: schema as any }],
  });
  done = true;
  return monaco;
}
