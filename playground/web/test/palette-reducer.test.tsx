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
const root = schema as unknown as SchemaNode;

/** A miniature of App.tsx's Add wiring over the real reducer (no engine, no canvas). */
function MiniApp({ text }: { text: string }) {
  const [state, dispatch] = useReducer(reducer, text, initialState);
  const [launcher, setLauncher] = useState<LauncherRequest | null>(null);
  const values = launcher ? (state.doc.toJS() as Record<string, unknown>) : {};
  return (
    <div>
      <AddButton disabled={state.doc.errors.length > 0} open={launcher} onOpen={() => setLauncher({})} onClose={() => setLauncher(null)}
        root={root} values={values}
        onAdd={(key, name) => dispatch({ type: 'edit', ops: addEntityOps(root, key, name), focus: [key, name] })} />
      <pre data-testid="text">{state.text}</pre>
      <span data-testid="focus">{JSON.stringify(state.focusPath)}</span>
      <span data-testid="err">{state.editError ?? ''}</span>
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
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'deployments:\n  - name: api\n'} />);
    const btn = screen.getByRole('button', { name: /Add/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);   // the document parses: nothing is disabled
    expect(() => addDeployment()).not.toThrow();
    expect(screen.getByTestId('text').textContent).toBe('deployments:\n  - name: api\n');
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
    expect(screen.queryByRole('dialog')).toBeNull();   // the launcher closed instead of wedging open
    spy.mockRestore();
  });
  it('an add that cannot land reports it and leaves the focus path clear', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MiniApp text={'- a\n- b\n'} />);
    expect(() => addDeployment()).not.toThrow();
    expect(screen.getByTestId('text').textContent).toBe('- a\n- b\n');
    expect(screen.getByTestId('focus').textContent).toBe('null');
    expect(screen.getByTestId('err').textContent).toBe(EDIT_FAILED);
    spy.mockRestore();
  });
});
