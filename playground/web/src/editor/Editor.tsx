import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import schema from '../chart-bundle/schema.json';
import { setupMonaco } from './monaco';

// Workers and the yaml schema must be registered before the first createModel/create call.
// Doing it here (setupMonaco is idempotent) keeps that ordering local to the only component
// that touches monaco, instead of relying on an import-order side effect in App.tsx.
setupMonaco(schema);

export type EditorMarker = { line: number; col?: number; message: string; severity: 'error' | 'warning' };

export function Editor({ value, onChange, markers, revealLine }: { value: string; onChange: (t: string) => void; markers: EditorMarker[]; revealLine: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  // Set while this component writes to the model itself; programmatic writes never emit onChange.
  const suppress = useRef(false);

  useEffect(() => {
    const m = monaco.editor.createModel(value, 'yaml', monaco.Uri.parse('inmemory://idlefy/values.yaml'));
    model.current = m;
    const ed = monaco.editor.create(host.current!, {
      model: m, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false,
      // YAML flow maps and quotes are typed literally; auto-closing produces broken YAML and makes e2e typing non-deterministic.
      autoClosingBrackets: 'never', autoClosingQuotes: 'never', autoIndent: 'keep',
    });
    editor.current = ed;
    const sub = m.onDidChangeContent(() => { if (!suppress.current) onChange(m.getValue()); });
    return () => { sub.dispose(); ed.dispose(); m.dispose(); model.current = null; editor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External text replacement (examples picker): single undoable edit, never setValue.
  useEffect(() => {
    const m = model.current; if (!m || m.getValue() === value) return;
    suppress.current = true;
    try { m.pushEditOperations([], [{ range: m.getFullModelRange(), text: value }], () => null); }
    finally { suppress.current = false; }
  }, [value]);

  useEffect(() => {
    const m = model.current; if (!m) return;
    // Engine line/col numbers can be out of range (0, or past the current text); monaco throws on those.
    monaco.editor.setModelMarkers(m, 'engine', markers.map((k) => {
      const line = Math.min(Math.max(1, k.line), m.getLineCount());
      const col = k.col === undefined ? undefined : Math.max(1, k.col);
      return {
        startLineNumber: line, endLineNumber: line, startColumn: col ?? 1, endColumn: col ? col + 1 : m.getLineMaxColumn(line),
        message: k.message, severity: k.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      };
    }));
  }, [markers]);

  useEffect(() => { if (revealLine && editor.current) editor.current.revealLineInCenter(revealLine); }, [revealLine]);

  return <div ref={host} className="editor" />;
}
