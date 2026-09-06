import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import YamlWorker from 'monaco-yaml/yaml.worker?worker';
import { configureMonacoYaml, type JSONSchema } from 'monaco-yaml';

let done = false;
export function setupMonaco(schema: JSONSchema) {
  if (done) return monaco;
  const env: monaco.Environment = { getWorker: (_workerId: string, label: string) => (label === 'yaml' ? new YamlWorker() : new EditorWorker()) };
  self.MonacoEnvironment = env;
  configureMonacoYaml(monaco, {
    enableSchemaRequest: false, hover: true, completion: true, validate: true, format: { enable: true },
    schemas: [{ uri: 'inmemory://idlefy/values.schema.json', fileMatch: ['values.yaml'], schema }],
  });
  done = true;
  return monaco;
}
