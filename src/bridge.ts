import type { Notebook, Operation, Proof } from './core';
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface ModelConfig { endpoint: string; model: string; key?: string; hasKey?: boolean }
export type Settings = Record<'qa' | 'graph', ModelConfig>;
export interface AIEvent { type: 'text' | 'status' | 'done' | 'error' | 'operations'; text?: string; operations?: Operation[] }
interface API {
  open_file(): Promise<Result<unknown | null>>;
  save_file(data: Notebook | Proof, saveAs: boolean): Promise<Result<boolean>>;
  reset_file(): Promise<Result<null>>;
  dirty(value: boolean): Promise<void>;
  close_window(): Promise<void>;
  get_settings(): Promise<Result<Settings>>;
  save_settings(value: Settings): Promise<Result<null>>;
  start_ai(id: string, prompt: string, nodes: string[], images: string[], note: Notebook, history: {role: string; content: string}[], kind?: 'qa' | 'graph', level?: 'brief' | 'normal' | 'detailed'): Promise<Result<null>>;
  poll_ai(id: string): Promise<Result<AIEvent[]>>;
  cancel_ai(id: string): Promise<Result<null>>;
}
declare global { interface Window { pywebview?: { api: API }; supernoteClose?: () => void } }
export const isDesktop = () => !!window.pywebview?.api;
export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> { const r = await p; if (!r.ok) throw new Error(r.error); return r.value; }
export function api(): API { if (!window.pywebview?.api) throw new Error('此功能需要桌面模式：请运行 python -m desktop.main'); return window.pywebview.api; }
export async function openFile(): Promise<unknown | null> {
  if (isDesktop()) return unwrap(api().open_file());
  return new Promise(resolve => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.json'; el.oncancel = () => resolve(null); el.onchange = async () => { try { resolve(JSON.parse(await el.files![0].text())); } catch { resolve({ error: '无效 JSON 文件' }); } }; el.click(); });
}
export async function saveFile(data: Notebook | Proof, saveAs = false): Promise<boolean> {
  if (isDesktop()) return unwrap(api().save_file(data, saveAs));
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.href = url; a.download = `${data.title || '推导'}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
}
