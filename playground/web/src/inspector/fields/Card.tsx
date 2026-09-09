import type { ReactElement, ReactNode } from 'react';

/** The `<div className="card">` chrome shared by `ContainersField` (one card per container) and
 *  `MapOfListsField` (one card per key): a heading with a code label, an optional aside, a remove
 *  button, and the card body. */
export function Card(p: {
  code: string; aside?: ReactElement; removeLabel: string; removeTitle: string; removeText: string; onRemove: () => void; children: ReactNode;
}): ReactElement {
  return (
    <div className="card">
      <h4><code>{p.code}</code>{p.aside}<button type="button" className="clear" aria-label={p.removeLabel} title={p.removeTitle} onClick={p.onRemove}>{p.removeText}</button></h4>
      {p.children}
    </div>
  );
}
