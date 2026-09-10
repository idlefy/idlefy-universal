// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Toolbar } from '../src/editor/Toolbar';

afterEach(cleanup);
const setup = (release = 'demo', ns = 'default') => {
  const onPickExample = vi.fn();
  render(<Toolbar release={release} ns={ns} onRelease={vi.fn()} onNs={vi.fn()} onPickExample={onPickExample}
    valuesText="" chartVersion="1.2.0" onHide={vi.fn()} />);
  return { onPickExample };
};

describe('Toolbar', () => {
  it('re-picking the same example fires again (the select never keeps a selection)', () => {
    const { onPickExample } = setup();
    const select = screen.getByLabelText('examples') as HTMLSelectElement;
    const first = Array.from(select.options).find((o) => o.value !== '')!.value;
    fireEvent.change(select, { target: { value: first } });
    expect(onPickExample).toHaveBeenCalledWith(first);
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: first } });
    expect(onPickExample).toHaveBeenCalledTimes(2);
  });
  it('marks a release name or namespace Kubernetes would reject', () => {
    setup('demo', 'default');
    expect((screen.getByLabelText('release') as HTMLInputElement).className).not.toContain('invalid');
    cleanup();
    setup('My Release', 'Bad NS!');
    const rel = screen.getByLabelText('release') as HTMLInputElement;
    const ns = screen.getByLabelText('namespace') as HTMLInputElement;
    expect(rel.className).toContain('invalid');
    expect(rel.getAttribute('aria-invalid')).toBe('true');
    expect(ns.className).toContain('invalid');
    expect(ns.getAttribute('aria-invalid')).toBe('true');
    cleanup();
    setup('r'.repeat(54), 'default');
    expect((screen.getByLabelText('release') as HTMLInputElement).className).toContain('invalid');
  });
  it('rejects a release name with an empty or dash-bounded dot-separated part, and carries the rule in its title', () => {
    setup('a..b', 'default');
    const rel = screen.getByLabelText('release') as HTMLInputElement;
    expect(rel.className).toContain('invalid');
    expect(rel.title).toBe('Lowercase letters, digits, dashes and dots; each dot-separated part must start and end with a letter or digit; at most 53 characters.');
    cleanup();
    setup('a-.b', 'default');
    expect((screen.getByLabelText('release') as HTMLInputElement).className).toContain('invalid');
    cleanup();
    setup('a.b-c.d', 'default');   // multiple valid dot-separated parts stay accepted
    expect((screen.getByLabelText('release') as HTMLInputElement).className).not.toContain('invalid');
  });
});
