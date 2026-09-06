import chartFiles from '../chart-bundle/chart.json';
import schema from '../chart-bundle/schema.json';
import { splitManifests } from './split';
import { SUPERSEDED, type EngineRawResult, type Manifest, type RenderResult } from './types';

export { SUPERSEDED };
const filesJSON = JSON.stringify({ ...(chartFiles as Record<string, string>), 'values.schema.json': JSON.stringify(schema) });

export class EngineClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, (r: RenderResult) => void>();
  private booted = false;
  /** Set once the Go instance died; every later render() resolves with it instead of hanging. */
  private dead: string | null = null;
  readonly ready: Promise<void>;
  /** Rejects if the engine dies after a successful boot. Never resolves. */
  readonly crashed: Promise<never>;
  private onCrash!: (e: Error) => void;

  constructor(base: string = (import.meta as any).env?.BASE_URL ?? '/playground/') {
    this.worker = new Worker(`${base}engine-worker.js`);
    this.crashed = new Promise<never>((_, reject) => { this.onCrash = reject; });
    this.ready = new Promise<void>((resolve, reject) => {
      const onBoot = (ev: MessageEvent) => {
        if (ev.data?.ready) { this.worker.removeEventListener('message', onBoot); this.booted = true; resolve(); }
        else if (typeof ev.data?.error === 'string') { this.worker.removeEventListener('message', onBoot); reject(new Error(ev.data.error)); }
      };
      this.worker.addEventListener('message', onBoot);
      // A native worker `error` (uncaught exception / failed script load) before boot fails
      // `ready`; after boot it is a crash like an {error} message — an in-flight render must
      // not hang on it.
      this.worker.addEventListener('error', (e) => {
        const message = e.message || 'engine worker failed';
        if (this.booted) this.crash(message);
        else reject(new Error(message));
      });
    });
    this.worker.addEventListener('message', (ev: MessageEvent) => {
      const { id, result, durationMs, error } = ev.data as { id?: number; result?: EngineRawResult; durationMs?: number; error?: string };
      // An {error} after boot is a dead Go instance: nothing it renders can be trusted again, and
      // only a reload can bring it back. Settle everyone in flight, then report the fatal error.
      if (typeof error === 'string' && this.booted) {
        this.crash(error);
        return;
      }
      if (typeof id !== 'number' || !result) return;
      const cb = this.pending.get(id);
      if (!cb) return;
      this.pending.delete(id);
      cb(toRenderResult(result, durationMs ?? 0));
    });
    this.worker.postMessage({ init: base });
  }

  async render(values: string, release: string, ns: string): Promise<RenderResult> {
    // render() resolves for every call, so a failed boot becomes a result rather than a rejection.
    try { await this.ready; }
    catch (e) { return { ok: false, error: { kind: 'template', message: e instanceof Error ? e.message : String(e) } }; }
    if (this.dead) return { ok: false, error: { kind: 'template', message: this.dead } };
    const id = ++this.seq;
    // latest-wins: every older caller is settled immediately with a sentinel the reducer ignores.
    this.settlePending();
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, files: filesJSON, values, release, ns });
    });
  }

  terminate() { this.settlePending(); this.worker.terminate(); }

  /** Terminal failure after boot: mark dead (first error wins), settle in-flight renders, reject `crashed`. */
  private crash(message: string) {
    if (this.dead) return;
    this.dead = `${message} — reload the page`;
    this.settlePending();
    this.onCrash(new Error(this.dead));
  }

  /** Settles every in-flight render with the sentinel and empties the map — no promise is left pending. */
  private settlePending() {
    for (const [oldId, cb] of this.pending) { this.pending.delete(oldId); cb({ ok: false, error: { kind: 'template', message: SUPERSEDED } }); }
  }
}

export function toRenderResult(raw: EngineRawResult, durationMs: number): RenderResult {
  if (!raw.ok) return { ok: false, error: { ...raw.error, path: raw.error.path || undefined } };
  const manifests: Manifest[] = [];
  for (const [templatePath, text] of Object.entries(raw.manifests).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      manifests.push(...splitManifests(templatePath, text));
    } catch (e) {
      return { ok: false, error: { kind: 'yaml', message: e instanceof Error ? e.message : String(e), path: templatePath } };
    }
  }
  return { ok: true, manifests, durationMs };
}
