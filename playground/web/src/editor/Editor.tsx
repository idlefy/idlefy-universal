import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import schema from '../chart-bundle/schema.json';
import { setupMonaco } from './monaco';
import { externalEdit } from './pushGuard';

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
  // Text the model is known to already hold — set from onDidChangeContent and after every
  // programmatic push — so a `value` prop that merely echoes current model text is never re-applied.
  // Assumes onChange is dispatched synchronously and undebounced; a future debounce would let a
  // stale value slip through this guard and revert characters typed since.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const m = monaco.editor.createModel(value, 'yaml', monaco.Uri.parse('inmemory://idlefy/values.yaml'));
    model.current = m;
    const ed = monaco.editor.create(host.current!, {
      model: m, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false,
      // YAML flow maps and quotes are typed literally; auto-closing produces broken YAML and makes e2e typing non-deterministic.
      autoClosingBrackets: 'never', autoClosingQuotes: 'never', autoIndent: 'keep',
    });
    editor.current = ed;
    const sub = m.onDidChangeContent(() => { if (!suppress.current) { const t = m.getValue(); lastEmitted.current = t; onChange(t); } });
    return () => { sub.dispose(); ed.dispose(); m.dispose(); model.current = null; editor.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External text replacement (examples picker, inspector edits): one undoable edit covering only
  // the changed range, never setValue — Monaco's undo stack and cursor survive inspector writes.
  useEffect(() => {
    const m = model.current; if (!m) return;
    const edit = externalEdit(m.getValue(), lastEmitted.current, value);
    if (!edit) return;
    suppress.current = true;
    try {
      const start = m.getPositionAt(edit.start), end = m.getPositionAt(edit.end);
      m.pushStackElement();
      m.pushEditOperations([], [{ range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: edit.text }], () => null);
      m.pushStackElement();
      lastEmitted.current = value;
    } finally { suppress.current = false; }
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
