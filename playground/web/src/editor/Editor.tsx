import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import schema from '../chart-bundle/schema.json';
import { setupMonaco } from './monaco';
import { externalEdit } from './pushGuard';
import { blockDecorations, type LineRange } from './decorations';

// Workers and the yaml schema must be registered before the first createModel/create call.
// Doing it here (setupMonaco is idempotent) keeps that ordering local to the only component
// that touches monaco, instead of relying on an import-order side effect in App.tsx.
setupMonaco(schema);

export type EditorMarker = { line: number; col?: number; message: string; severity: 'error' | 'warning' };

export function Editor({ value, onChange, markers, highlight, visible }: { value: string; onChange: (t: string) => void; markers: EditorMarker[]; highlight: LineRange | null; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const model = useRef<monaco.editor.ITextModel | null>(null);
  const decos = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
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
    const darkMedia = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const ed = monaco.editor.create(host.current!, {
      model: m, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false,
      folding: true, showFoldingControls: 'always', foldingStrategy: 'indentation',
      guides: { indentation: true, bracketPairs: false },
      stickyScroll: { enabled: true, maxLineCount: 4 },
      lineNumbersMinChars: 3, renderLineHighlight: 'line', padding: { top: 6 },
      // YAML flow maps and quotes are typed literally; auto-closing produces broken YAML and makes e2e typing non-deterministic.
      autoClosingBrackets: 'never', autoClosingQuotes: 'never', autoIndent: 'keep',
      theme: darkMedia?.matches ? 'vs-dark' : 'vs',
    });
    editor.current = ed;
    decos.current = ed.createDecorationsCollection();
    const sub = m.onDidChangeContent(() => { if (!suppress.current) { const t = m.getValue(); lastEmitted.current = t; onChange(t); } });
    // Monaco's theme is a global registry, not per-editor, but there is only ever one Editor mounted.
    const onSchemeChange = (e: MediaQueryListEvent) => monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
    darkMedia?.addEventListener('change', onSchemeChange);
    return () => { darkMedia?.removeEventListener('change', onSchemeChange); sub.dispose(); decos.current?.clear(); ed.dispose(); m.dispose(); model.current = null; editor.current = null; };
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

  useEffect(() => {
    const ed = editor.current; if (!ed) return;
    decos.current?.set(blockDecorations(highlight));
    // Reveal only while the pane is actually visible: Monaco has no real viewport while `hidden`,
    // so a reveal computed then is a no-op and the block is never centred once the pane opens.
    // Re-layout first so the just-opened pane's real size is what the reveal centres against.
    if (highlight && visible) { ed.layout(); ed.revealLineInCenterIfOutsideViewport(highlight.start); }
  }, [highlight, visible]);

  return <div ref={host} className="editor" />;
}
