import { z } from 'zod';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const identity = z.string().min(1).max(160);
export const tagSchema = z.object({ id: identity, name: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export const domainSchema = z.object({ id: identity, name: z.string().min(1), position: point });
export const unitSchema = z.object({ id: identity, domainId: identity, content: z.string(), tags: z.array(identity), annotation: z.string().default(''), position: point, image: z.string().startsWith('data:image/').optional() });
export const edgeSchema = z.object({ id: identity, source: identity, target: identity, direction: z.enum(['single', 'both']) });
export const proofSchema = z.object({ kind: z.literal('supernote-proof'), version: z.literal(1), id: identity, title: z.string(), notebookId: identity, target: identity, nodeIds: z.array(identity), edgeIds: z.array(identity), nodes: z.array(unitSchema), edges: z.array(edgeSchema) });
export const noteSchema = z.object({ kind: z.literal('supernote'), version: z.literal(1), id: identity, title: z.string().min(1), domains: z.array(domainSchema), nodes: z.array(unitSchema), edges: z.array(edgeSchema), tags: z.array(tagSchema), proofs: z.array(proofSchema) });
export type Unit = z.infer<typeof unitSchema>;
export type Domain = z.infer<typeof domainSchema>;
export type Link = z.infer<typeof edgeSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Proof = z.infer<typeof proofSchema>;
export type Notebook = z.infer<typeof noteSchema>;
export const defaults: Tag[] = [{ id: 'fact', name: '基本事实', color: '#c89932' }, { id: 'conclusion', name: '结论', color: '#3577db' }, { id: 'inside', name: '课内', color: '#68a8a2' }, { id: 'outside', name: '课外', color: '#b18bce' }];
export const uid = () => crypto.randomUUID();
export const emptyNote = (): Notebook => ({ kind: 'supernote', version: 1, id: uid(), title: '未命名笔记', domains: [], nodes: [], edges: [], tags: structuredClone(defaults), proofs: [] });
function unique(items: { id: string }[], label: string) { if (new Set(items.map(x => x.id)).size !== items.length) throw new Error(`${label} ID 重复`); }
export function validate(input: unknown): Notebook {
  const n = noteSchema.parse(input);
  unique([...n.nodes, ...n.edges, ...n.domains, ...n.tags, ...n.proofs], '数据');
  for (const t of defaults) if (!n.tags.some(x => x.id === t.id && x.name === t.name && x.color === t.color)) throw new Error('默认标签不可更改');
  for (const u of n.nodes) {
    if (!n.domains.some(d => d.id === u.domainId)) throw new Error('节点所属域不存在');
    if (u.tags.some(t => !n.tags.some(x => x.id === t)) || new Set(u.tags).size !== u.tags.length) throw new Error('节点标签无效');
    if ((u.tags.includes('fact') && u.tags.includes('conclusion')) || (u.tags.includes('inside') && u.tags.includes('outside'))) throw new Error('互斥标签不能同时选择');
  }
  const pairs = new Set<string>();
  for (const e of n.edges) {
    if (e.source === e.target || !n.nodes.some(u => u.id === e.source) || !n.nodes.some(u => u.id === e.target)) throw new Error('连接端点无效');
    const key = JSON.stringify([e.source, e.target].sort());
    if (pairs.has(key)) throw new Error('重复连接，请修改已有连接方向');
    pairs.add(key);
  }
  n.proofs.forEach(validateProof);
  return n;
}
export type Operation = { action: 'put' | 'delete'; entity: 'domains' | 'nodes' | 'edges' | 'tags'; id: string; value?: unknown };
export function applyOperations(note: Notebook, ops: Operation[]): Notebook {
  const next = structuredClone(note);
  for (const op of ops) {
    if (!['domains', 'nodes', 'edges', 'tags'].includes(op.entity) || !['put', 'delete'].includes(op.action)) throw new Error('未知图操作');
    if (op.entity === 'tags' && defaults.some(t => t.id === op.id)) throw new Error('默认标签不可更改');
    if (op.action === 'put') {
      const schema = { domains: domainSchema, nodes: unitSchema, edges: edgeSchema, tags: tagSchema }[op.entity];
      const value = schema.parse(op.value);
      if (value.id !== op.id) throw new Error('操作 ID 不匹配');
      const list = next[op.entity] as { id: string }[];
      const index = list.findIndex(x => x.id === op.id);
      if (index < 0) list.push(value); else list[index] = value;
    } else {
      if (op.entity === 'domains') next.nodes = next.nodes.filter(u => u.domainId !== op.id);
      if (op.entity === 'tags') next.nodes.forEach(u => { u.tags = u.tags.filter(t => t !== op.id); });
      (next[op.entity] as { id: string }[]) = next[op.entity].filter(x => x.id !== op.id);
      if (op.entity === 'domains' || op.entity === 'nodes') next.edges = next.edges.filter(e => next.nodes.some(u => u.id === e.source) && next.nodes.some(u => u.id === e.target));
    }
  }
  return validate(next);
}
export function neighbors(n: Pick<Notebook, 'edges'>, id: string, reverse = false) {
  return n.edges.flatMap(e => {
    const source = reverse ? e.target : e.source, target = reverse ? e.source : e.target;
    return source === id ? [{ id: target, edge: e.id }] : e.direction === 'both' && target === id ? [{ id: source, edge: e.id }] : [];
  });
}
export function reachable(n: Pick<Notebook, 'edges'>, start: string[], reverse = false, blocked = new Set<string>()) {
  const seen = new Set<string>(), stack = [...start];
  while (stack.length) { const id = stack.pop()!; if (seen.has(id) || blocked.has(id)) continue; seen.add(id); for (const x of neighbors(n, id, reverse)) stack.push(x.id); }
  return seen;
}
export function proofRegion(n: Notebook, target: string) {
  const from = reachable(n, n.nodes.filter(u => u.tags.includes('fact')).map(u => u.id));
  const to = reachable(n, [target], true);
  return new Set([...from].filter(id => to.has(id)));
}
export function nextSteps(n: Notebook, target: string, path: string[]) {
  if (!path.length) return n.nodes.filter(u => u.tags.includes('fact') && reachable(n, [u.id]).has(target)).map(u => u.id);
  if (path.at(-1) === target) return [];
  const blocked = new Set(path);
  return neighbors(n, path.at(-1)!).filter(x => !blocked.has(x.id) && reachable(n, [x.id], false, blocked).has(target)).map(x => x.id);
}
export function allProofPaths(n: Notebook, target: string, limit = 200) {
  const result: string[][] = [];
  const walk = (path: string[]) => {
    if (result.length >= limit) return;
    const current = path.at(-1)!;
    if (current === target) { result.push(path); return; }
    neighbors(n, current).forEach(next => { if (!path.includes(next.id)) walk([...path, next.id]); });
  };
  n.nodes.filter(u => u.tags.includes('fact')).forEach(u => walk([u.id]));
  return result;
}
export function validPath(n: Pick<Notebook, 'nodes' | 'edges'>, target: string, ids: string[], edgeIds?: string[]) {
  if (!ids.length || ids.at(-1) !== target || new Set(ids).size !== ids.length || !n.nodes.find(u => u.id === ids[0])?.tags.includes('fact')) return false;
  return ids.every((id, i) => n.nodes.some(u => u.id === id) && (!i || neighbors(n, ids[i - 1]).some(x => x.id === id && (!edgeIds || x.edge === edgeIds[i - 1])))) && (!edgeIds || edgeIds.length === ids.length - 1);
}
export function validateProof(input: unknown): Proof {
  const p = proofSchema.parse(input); unique(p.nodes, '快照节点'); unique(p.edges, '快照连接');
  if (!validPath(p, p.target, p.nodeIds, p.edgeIds) || p.nodes.length !== p.nodeIds.length || p.edges.length !== p.edgeIds.length) throw new Error('推导文件路径无效');
  return p;
}
export function snapshot(n: Notebook, target: string, ids: string[], id = uid()): Proof {
  if (!validPath(n, target, ids)) throw new Error('请选择从基本事实到目标的完整路径');
  const edgeIds = ids.slice(1).map((x, i) => neighbors(n, ids[i]).find(v => v.id === x)!.edge);
  return { kind: 'supernote-proof', version: 1, id, title: n.nodes.find(u => u.id === target)!.content.replace(/[#*$]/g, '').slice(0, 32), notebookId: n.id, target, nodeIds: [...ids], edgeIds, nodes: structuredClone(ids.map(x => n.nodes.find(u => u.id === x)!)), edges: structuredClone(edgeIds.map(x => n.edges.find(e => e.id === x)!)) };
}
export function mergeGroups(n: Notebook, editing?: string): string[][] {
  const next = new Map<string, string>();
  for (const u of n.nodes) {
    const incident = n.edges.filter(e => e.source === u.id || e.target === u.id);
    const incoming = incident.filter(e => e.target === u.id), outgoing = incident.filter(e => e.source === u.id);
    if (u.id === editing || incident.length !== 2 || incident.some(e => e.direction === 'both') || incoming.length !== 1 || outgoing.length !== 1) continue;
    const dest = n.nodes.find(x => x.id === outgoing[0].target)!;
    if (dest.id !== editing && dest.domainId === u.domainId) next.set(u.id, dest.id);
  }
  // 汇合点保留独立卡片，避免多个分支被误拼成一条链。
  const counts = new Map<string, number>(); next.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  for (const [k, v] of next) if ((counts.get(v) || 0) > 1) next.delete(k);
  const cycles = new Set<string>();
  for (const start of next.keys()) { const chain: string[] = []; let cur: string | undefined = start; while (cur && next.has(cur)) { if (chain.includes(cur)) { chain.slice(chain.indexOf(cur)).forEach(x => cycles.add(x)); break; } chain.push(cur); cur = next.get(cur); } }
  cycles.forEach(x => next.delete(x));
  const targets = new Set(next.values()), used = new Set<string>(), groups: string[][] = [];
  for (const u of n.nodes) { if (targets.has(u.id)) continue; const group: string[] = []; let id: string | undefined = u.id; while (id && !used.has(id)) { used.add(id); group.push(id); id = next.get(id); } if (group.length) groups.push(group); }
  n.nodes.filter(u => !used.has(u.id)).forEach(u => groups.push([u.id])); return groups;
}
