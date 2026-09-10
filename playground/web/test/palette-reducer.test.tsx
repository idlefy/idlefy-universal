// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useReducer, useState } from 'react';
import schema from '../src/chart-bundle/schema.json';
import type { SchemaNode } from '../src/inspector/schema';
import { reducer, initialState, EDIT_FAILED } from '../src/app/state';
import { AddButton, type LauncherRequest } from '../src/palette/AddButton';
import { addEntityOps } from '../src/palette/add';

afterEach(cleanup);
afterEach(() => vi.restoreAllMocks());
const root = schema as unknown as SchemaNode;

/** A miniature of App.tsx's Add wiring over the real reducer (no engine, no canvas). `exampleText`
 *  wires a button that dispatches a real `example` action; `forceFail` wires a button that dispatches
 *  an `edit` with a Symbol value (the same shape test/state.test.ts uses) so a test can arm a real
 *  editError through the actual reducer without depending on a second, distinct Add succeeding. */
function MiniApp({ text, exampleText, forceFail }: { text: string; exampleText?: string; forceFail?: boolean }) {
  const [state, dispatch] = useReducer(reducer, text, initialState);
  const [launcher, setLauncher] = useState<LauncherRequest | null>(null);
  const values = launcher ? (state.doc.toJS() as Record<string, unknown>) : {};
  return (
    <div>
      <AddButton disabled={state.doc.errors.length > 0} open={launcher} onOpen={() => setLauncher({})} onClose={() => setLauncher(null)}
        root={root} values={values}
        onAdd={(key, name) => dispatch({ type: 'edit', ops: addEntityOps(root, key, name), focus: [key, name] })} />
      {exampleText !== undefined && (
        <button onClick={() => dispatch({ type: 'example', text: exampleText })}>load example</button>
      )}
      {forceFail && (
        // A Symbol op is a serialize failure (ValuesDocument.toString() cannot emit it, falls back to
        // the source, sets `stringifyFailed`), which the reducer now surfaces unconditionally — see
        // state.test.ts. `focus` isn't required to arm editError here; it's carried only to mirror how
        // a real palette Add always dispatches one.
        <button onClick={() => dispatch({ type: 'edit', ops: [{ op: 'set', path: ['zzz'], value: Symbol('x') }], focus: ['zzz'] })}>force fail</button>
      )}
      <pre data-testid="text">{state.text}</pre>
      <span data-testid="focus">{JSON.stringify(state.focusPath)}</span>
      <span data-testid="err">{state.editError ?? ''}</span>
      {/* mirrors App.tsx's editError banner, key and all — see test below for why the key matters */}
      {state.editError && <div key={state.editErrorSeq} role="alert">{state.editError}</div>}
    </div>
  );
}

const addDeployment = () => {
  fireEvent.click(screen.getByRole('button', { name: /Add/ }));
  fireEvent.click(screen.getByRole('option', { name: /^Deployment/ }));
  fireEvent.click(screen.getByLabelText('Add Deployment'));
};

describe('the palette over the real reducer', () => {
  it('adds into an empty document and arms the focus path', () => {
    render(<MiniApp text="" />);
    addDeployment();
    expect(screen.getByTestId('text').textContent).toContain('backend-api:');
    expect(screen.getByTestId('focus').textContent).toBe('["deployments","backend-api"]');
    expect(screen.getByTestId('err').textContent).toBe('');
  });
  it('a top-level key holding a sequence does not crash the app; the add is refused and reported', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'deployments:\n  - name: api\n'} />);
    const btn = screen.getByRole('button', { name: /Add/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);   // the document parses: nothing is disabled
    expect(() => addDeployment()).not.toThrow();
    expect(screen.getByTestId('text').textContent).toBe('deployments:\n  - name: api\n');
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
    expect(screen.queryByRole('dialog')).toBeNull();   // the launcher closed instead of wedging open
  });
  it('an add that cannot land reports it and leaves the focus path clear', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'- a\n- b\n'} />);
    expect(() => addDeployment()).not.toThrow();
    expect(screen.getByTestId('text').textContent).toBe('- a\n- b\n');
    expect(screen.getByTestId('focus').textContent).toBe('null');
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
  });
  it('a repeated identical failure still remounts the banner (editErrorSeq keys it) so role="alert" re-announces', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'- a\n- b\n'} />);
    addDeployment();
    const first = screen.getByRole('alert');
    expect(first.textContent).toBe(EDIT_FAILED);
    addDeployment();
    const second = screen.getByRole('alert');
    expect(second.textContent).toBe(EDIT_FAILED);
    expect(second).not.toBe(first);
  });
  it('a successful add clears a previously set editError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text="" forceFail />);
    fireEvent.click(screen.getByRole('button', { name: 'force fail' }));   // throwing op: sets editError, keeps the (empty) doc
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
    addDeployment();   // a real, landing add through the real AddButton/reducer wiring
    expect(screen.getByTestId('text').textContent).toContain('backend-api:');
    expect(screen.getByTestId('err').textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('loading an example clears a previously set editError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'- a\n- b\n'} exampleText="deployments: {}\n" />);
    addDeployment();   // sequence root: fails, sets editError
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
    fireEvent.click(screen.getByRole('button', { name: 'load example' }));
    expect(screen.getByTestId('err').textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
