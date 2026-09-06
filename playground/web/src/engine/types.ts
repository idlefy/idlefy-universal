export type KubeObject = {
  apiVersion?: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  spec?: any;
  [k: string]: any;
};
export type Manifest = { templatePath: string; docIndex: number; raw: string; obj: KubeObject };
export type RenderErrorKind = 'yaml' | 'schema' | 'template' | 'kubeVersion';
export type RenderError = { kind: RenderErrorKind; message: string; path?: string };
export type RenderResult =
  | { ok: true; manifests: Manifest[]; durationMs: number }
  | { ok: false; error: RenderError };
export type EngineRawResult =
  | { ok: true; manifests: Record<string, string> }
  | { ok: false; error: RenderError };
/** error.message of a render() call that was superseded by a newer one; consumers ignore such results. */
export const SUPERSEDED = 'superseded';
