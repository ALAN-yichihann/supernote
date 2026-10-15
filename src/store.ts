import { create } from 'zustand';
import { applyOperations, emptyNote, validate, type Notebook, type Operation } from './core';
interface State { note: Notebook; saved: string; past: Notebook[]; future: Notebook[]; locked: boolean; revision: number; error: string; setError: (s: string) => void; commit: (n: Notebook) => void; operate: (ops: Operation[]) => void; undo: () => void; redo: () => void; load: (n: Notebook) => void; markSaved: (n: Notebook) => void; }
const initial = emptyNote();
export const useStore = create<State>((set, get) => ({
  note: initial, saved: JSON.stringify(initial), past: [], future: [], locked: false, revision: 0, error: '', setError: error => set({ error }),
  commit: note => { const s = get(); if (s.locked) throw new Error('AI 正在处理，请等待完成或取消'); const n = validate(note); if (JSON.stringify(n) === JSON.stringify(s.note)) return; set({ note: n, past: [...s.past.slice(-99), s.note], future: [], revision: s.revision + 1 }); },
  operate: ops => get().commit(applyOperations(get().note, ops)),
  undo: () => { const s = get(); if (s.locked || !s.past.length) return; set({ note: s.past.at(-1)!, past: s.past.slice(0, -1), future: [s.note, ...s.future], revision: s.revision + 1 }); },
  redo: () => { const s = get(); if (s.locked || !s.future.length) return; set({ note: s.future[0], past: [...s.past, s.note], future: s.future.slice(1), revision: s.revision + 1 }); },
  load: note => { if (get().locked) throw new Error('请先取消 AI 任务'); const n = validate(note); set({ note: n, saved: JSON.stringify(n), past: [], future: [], revision: get().revision + 1 }); },
  markSaved: note => set({ saved: JSON.stringify(note) }),
}));
export function safely(fn: () => void) { try { fn(); } catch (e) { useStore.getState().setError(e instanceof Error ? e.message : String(e)); } }
