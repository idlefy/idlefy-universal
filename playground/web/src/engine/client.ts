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
  readonly ready: Promise<void>;

  constructor(base: string = (import.meta as any).env?.BASE_URL ?? '/playground/') {
    this.worker = new Worker(`${base}engine-worker.js`);
    this.ready = new Promise<void>((resolve, reject) => {
      const onBoot = (ev: MessageEvent) => {
        if (ev.data?.ready) { this.worker.removeEventListener('message', onBoot); resolve(); }
        else if (typeof ev.data?.error === 'string') { this.worker.removeEventListener('message', onBoot); reject(new Error(ev.data.error)); }
      };
      this.worker.addEventListener('message', onBoot);
      this.worker.addEventListener('error', (e) => reject(new Error(e.message || 'engine worker failed to start')));
    });
    this.worker.addEventListener('message', (ev: MessageEvent) => {
      const { id, result, durationMs } = ev.data as { id?: number; result?: EngineRawResult; durationMs?: number };
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
    const id = ++this.seq;
    // latest-wins: every older caller is settled immediately with a sentinel the reducer ignores.
    this.settlePending();
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, files: filesJSON, values, release, ns });
    });
  }

  terminate() { this.settlePending(); this.worker.terminate(); }

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
