// Classic Web Worker: loads helm.wasm once, then answers {id, files, values, release, ns} requests.
// Messages out: {ready:true} | {error:string} | {id, result, durationMs}
let booted = false;

async function boot(base) {
  importScripts(base + 'wasm_exec.js');
  const go = new Go();
  const resp = await fetch(base + 'helm.wasm');
  if (!resp.ok) throw new Error(`helm.wasm: HTTP ${resp.status}`);
  let instance;
  if (WebAssembly.instantiateStreaming && (resp.headers.get('content-type') || '').includes('application/wasm')) {
    ({ instance } = await WebAssembly.instantiateStreaming(resp, go.importObject));
  } else {
    ({ instance } = await WebAssembly.instantiate(await resp.arrayBuffer(), go.importObject));
  }
  go.run(instance); // resolves never: main() blocks on select{}
  booted = true;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg && typeof msg.init === 'string') {
    try { await boot(msg.init); self.postMessage({ ready: true }); }
    catch (e) { self.postMessage({ error: String(e && e.message ? e.message : e) }); }
    return;
  }
  if (!booted) { self.postMessage({ id: msg.id, result: { ok: false, error: { kind: 'template', message: 'engine not ready' } }, durationMs: 0 }); return; }
  const t0 = performance.now();
  let result;
  try { result = JSON.parse(helmRender(msg.files, msg.values, msg.release, msg.ns)); }
  catch (e) { result = { ok: false, error: { kind: 'template', message: 'engine crashed: ' + String(e) } }; }
  self.postMessage({ id: msg.id, result, durationMs: Math.round(performance.now() - t0) });
};
