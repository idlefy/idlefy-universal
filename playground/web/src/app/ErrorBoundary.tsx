import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';

type State = { hasError: boolean; message: string };

/**
 * React 19 unmounts the whole root when a render-phase error escapes, leaving a blank page with
 * nothing to click. The playground keeps no server state, so the honest recovery is a reload —
 * this only makes sure there is something on screen to say so. Reuses the `.fatal` card the
 * engine-unavailable screen already styles.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' };
  // Focused once the fallback mounts so assistive tech lands on it immediately — `role="alert"` on
  // the card announces the text, but a screen reader user with keyboard focus still stuck on
  // whatever was under the pointer would otherwise never be told where to look.
  private heading = createRef<HTMLHeadingElement>();

  // `hasError` is tracked separately from `message`: an Error thrown with no message (or a thrown
  // non-Error whose String() is empty) must still flip the fallback on — a truthiness check on
  // `message` alone would keep showing `children` for exactly the errors that gave no other signal.
  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: ErrorInfo): void {
    console.error('playground crashed', err, info.componentStack);
    this.heading.current?.focus();
  }

  componentDidUpdate(_prevProps: { children: ReactNode }, prevState: State): void {
    // Catches the fallback being (re)shown without going through componentDidCatch again — e.g. a
    // future caller that flips `hasError` some other way. A no-op today, kept for symmetry so the
    // focus behavior doesn't silently depend on componentDidCatch being the only path in.
    if (this.state.hasError && !prevState.hasError) this.heading.current?.focus();
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h1 ref={this.heading} tabIndex={-1}>The playground hit an unexpected error</h1>
        <p>{this.state.message || 'No error message was provided.'}</p>
        <p>
          Reload the page to start again. Nothing is saved on a server, so any values.yaml you had
          typed is lost — the shipped examples are one pick away.
        </p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>Reload the page</button>
      </div>
    );
  }
}
