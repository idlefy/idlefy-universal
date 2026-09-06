import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EngineClient, SUPERSEDED } from '../src/engine/client';

type Listener = (ev: { data: unknown }) => void;

/** Minimal stand-in for the browser Worker the client talks to. */
class WorkerStub {
  static last: WorkerStub | undefined;
  readonly url: string;
  readonly posted: any[] = [];
  terminated = false;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    WorkerStub.last = this;
  }
  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  postMessage(msg: unknown) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  /** Delivers one message event to every listener registered at this moment. */
  emit(data: unknown) {
    for (const fn of [...(this.listeners.get('message') ?? [])]) fn({ data });
  }
  /** Delivers a native `error` event (uncaught exception inside the worker). */
  emitError(message: string) {
    for (const fn of [...(this.listeners.get('error') ?? [])]) fn({ message } as any);
  }
}

const svc = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: a\n';
const okReply = (id: number) => ({ id, result: { ok: true, manifests: { 'templates/svc.yaml': svc } }, durationMs: 7 });

/** Lets every already-queued microtask (the `await this.ready` continuations) run. */
const tick = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

function boot(): { client: EngineClient; worker: WorkerStub } {
  const client = new EngineClient('/base/');
  const worker = WorkerStub.last!;
  return { client, worker };
}

let saved: unknown;
beforeEach(() => {
  saved = (globalThis as any).Worker;
  (globalThis as any).Worker = WorkerStub;
  WorkerStub.last = undefined;
});
afterEach(() => {
  if (saved === undefined) delete (globalThis as any).Worker;
  else (globalThis as any).Worker = saved;
  WorkerStub.last = undefined;
});

describe('EngineClient boot', () => {
  it('resolves ready once the worker reports it booted', async () => {
    const { client, worker } = boot();
    expect(worker.url).toBe('/base/engine-worker.js');
    expect(worker.posted).toEqual([{ init: '/base/' }]);
    worker.emit({ ready: true });
    await expect(client.ready).resolves.toBeUndefined();
    client.terminate();
  });

  it('rejects ready with an Error and still resolves render() when boot fails', async () => {
    const { client, worker } = boot();
    const rejection = client.ready.then(() => undefined, (e: unknown) => e);
    worker.emit({ error: 'boom' });
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('boom');
    await expect(client.render('a: 1\n', 'rel', 'ns')).resolves.toEqual({
      ok: false,
      error: { kind: 'template', message: 'boom' },
    });
    client.terminate();
  });
});

describe('EngineClient render', () => {
  it('supersedes the older call and ignores a late reply for it', async () => {
    const { client, worker } = boot();
    worker.emit({ ready: true });
    await client.ready;

    const settled: unknown[] = [];
    const first = client.render('a: 1\n', 'rel', 'ns').then((r) => { settled.push(r); return r; });
    const second = client.render('a: 2\n', 'rel', 'ns');
    await tick();

    const renders = worker.posted.filter((m) => typeof m.id === 'number');
    expect(renders.map((m) => m.id)).toEqual([1, 2]);
    expect(renders[1].values).toBe('a: 2\n');

    expect(await first).toEqual({ ok: false, error: { kind: 'template', message: SUPERSEDED } });

    worker.emit(okReply(2));
    const r2 = await second;
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.manifests.map((m) => m.obj.metadata.name)).toEqual(['a']);
      expect(r2.durationMs).toBe(7);
    }

    // A reply for the superseded id is dropped: no throw, and `first` keeps its sentinel value.
    expect(() => worker.emit(okReply(1))).not.toThrow();
    await tick();
    expect(settled).toEqual([{ ok: false, error: { kind: 'template', message: SUPERSEDED } }]);
    client.terminate();
  });

  it('treats an {error} after boot as a permanent crash', async () => {
    const { client, worker } = boot();
    const crash = client.crashed.then(() => undefined, (e: unknown) => e);
    worker.emit({ ready: true });
    await client.ready;

    const inFlight = client.render('a: 1\n', 'rel', 'ns');
    await tick();
    worker.emit({ error: 'engine crashed: RuntimeError: stack overflow' });

    // The in-flight call is settled with the sentinel the reducer ignores...
    await expect(inFlight).resolves.toEqual({ ok: false, error: { kind: 'template', message: SUPERSEDED } });
    // ...the failure is exposed for the fatal panel, with the reload instruction...
    const err = await crash;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('engine crashed: RuntimeError: stack overflow — reload the page');
    // ...and every later render resolves with it instead of hanging on a dead worker.
    const postedBefore = worker.posted.length;
    await expect(client.render('a: 2\n', 'rel', 'ns')).resolves.toEqual({
      ok: false,
      error: { kind: 'template', message: 'engine crashed: RuntimeError: stack overflow — reload the page' },
    });
    expect(worker.posted.length).toBe(postedBefore);
    client.terminate();
  });

  it('settles an in-flight render when the client is terminated', async () => {
    const { client, worker } = boot();
    worker.emit({ ready: true });
    await client.ready;
    const pending = client.render('a: 1\n', 'rel', 'ns');
    await tick();
    client.terminate();
    expect(worker.terminated).toBe(true);
    await expect(pending).resolves.toEqual({ ok: false, error: { kind: 'template', message: SUPERSEDED } });
  });
});

describe('EngineClient native worker errors', () => {
  it('before boot fails ready', async () => {
    const { client, worker } = boot();
    worker.emitError('script load failed');
    await expect(client.ready).rejects.toThrow('script load failed');
    await expect(client.render('a: 1', 'r', 'ns')).resolves.toEqual({ ok: false, error: { kind: 'template', message: 'script load failed' } });
  });
  it('after boot is a crash: settles the in-flight render and rejects crashed', async () => {
    const { client, worker } = boot();
    const crash = client.crashed.then(() => undefined, (e: unknown) => e);
    worker.emit({ ready: true });
    const inFlight = client.render('a: 1', 'r', 'ns');
    await tick();
    worker.emitError('Uncaught RangeError: Maximum call stack size exceeded');
    await expect(inFlight).resolves.toEqual({ ok: false, error: { kind: 'template', message: SUPERSEDED } });
    expect(((await crash) as Error).message).toBe('Uncaught RangeError: Maximum call stack size exceeded — reload the page');
    await expect(client.render('b: 2', 'r', 'ns')).resolves.toEqual({
      ok: false, error: { kind: 'template', message: 'Uncaught RangeError: Maximum call stack size exceeded — reload the page' },
    });
  });
});
