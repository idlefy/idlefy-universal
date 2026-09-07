export type PaneId = 'editor' | 'inspector';
export type PaneState = { open: boolean; width: number };
export type PanesState = Record<PaneId, PaneState>;

export const PANE_LIMITS: Record<PaneId, { min: number; max: number; default: number }> = {
  editor: { min: 300, max: 720, default: 400 },
  inspector: { min: 320, max: 640, default: 400 },
};
export const DEFAULT_PANES: PanesState = {
  editor: { open: false, width: PANE_LIMITS.editor.default },
  inspector: { open: true, width: PANE_LIMITS.inspector.default },
};
export const STORAGE_KEY = 'idlefy-playground.panes.v1';

export function clampWidth(id: PaneId, width: number): number {
  const l = PANE_LIMITS[id];
  if (!Number.isFinite(width)) return l.default;
  return Math.min(l.max, Math.max(l.min, Math.round(width)));
}

/** Tolerant: any missing/garbage field falls back to the default for that pane. */
export function parsePanes(raw: string | null): PanesState {
  let obj: any = null;
  try { obj = raw ? JSON.parse(raw) : null; } catch { obj = null; }
  const out: PanesState = { editor: { ...DEFAULT_PANES.editor }, inspector: { ...DEFAULT_PANES.inspector } };
  if (!obj || typeof obj !== 'object') return out;
  for (const id of ['editor', 'inspector'] as PaneId[]) {
    const p = obj[id];
    if (!p || typeof p !== 'object') continue;
    if (typeof p.open === 'boolean') out[id].open = p.open;
    out[id].width = clampWidth(id, Number(p.width));
  }
  return out;
}

export function loadPanes(storage: Pick<Storage, 'getItem'> | null): PanesState {
  try { return parsePanes(storage ? storage.getItem(STORAGE_KEY) : null); } catch { return parsePanes(null); }
}

export function savePanes(storage: Pick<Storage, 'setItem'> | null, s: PanesState): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* private mode / quota: sizes just do not persist */ }
}
