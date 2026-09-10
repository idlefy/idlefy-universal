import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * React 19 unmounts the whole root when a render-phase error escapes, leaving a blank page with
 * nothing to click. The playground keeps no server state, so the honest recovery is a reload —
 * this only makes sure there is something on screen to say so. Reuses the `.fatal` card the
 * engine-unavailable screen already styles.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(err: unknown): { message: string } {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: ErrorInfo): void {
    console.error('playground crashed', err, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="fatal">
        <h1>The playground hit an unexpected error</h1>
        <p>{this.state.message}</p>
        <p>
          Reload the page to start again. Nothing is saved on a server, so any values.yaml you had
          typed is lost — the shipped examples are one pick away.
        </p>
        <button type="button" className="btn primary" onClick={() => location.reload()}>Reload the page</button>
      </div>
    );
  }
}
