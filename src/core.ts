import { z } from 'zod';

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const identity = z.string().min(1).max(160);
export const tagSchema = z.object({ id: identity, name: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export const domainSchema = z.object({ id: identity, name: z.string().min(1), position: point });
export const unitSchema = z.object({ id: identity, domainId: identity, content: z.string(), tags: z.array(identity), annotation: z.string().default(''), position: point, image: z.string().startsWith('data:image/').optional() });
export const edgeSchema = z.object({ id: identity, source: identity, target: identity, direction: z.enum(['single', 'both']) });
export const proofSchema = z.object({ kind: z.literal('supernote-proof'), version: z.literal(1), id: identity, title: z.string(), notebookId: identity, target: identity, nodeIds: z.array(identity), edgeIds: z.array(identity), order: z.array(identity).optional(), nodes: z.array(unitSchema), edges: z.array(edgeSchema) });
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

// 推导语义：指向某单位的连接。双向连接对两端都算入连接，可从任一端推导另一端。
export function incomingLinks(n: Pick<Notebook, 'edges'>, id: string): Link[] {
  return n.edges.filter(e => e.target === id || (e.direction === 'both' && e.source === id));
}
export function linkPredecessor(e: Link, id: string) { return e.source === id ? e.target : e.source; }
function isFact(n: Pick<Notebook, 'nodes'>, id: string) { return !!n.nodes.find(u => u.id === id)?.tags.includes('fact'); }
export function isConclusion(n: Pick<Notebook, 'nodes'>, id: string) { return !!n.nodes.find(u => u.id === id)?.tags.includes('conclusion'); }
export const isFactUnit = isFact;

// 反向搜索到基本事实为止，得到推导可能用到的全部单位（用于绘制推导子图）。
export function proofRegion(n: Notebook, target: string): Set<string> {
  const seen = new Set<string>(), stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !n.nodes.some(u => u.id === id)) continue;
    seen.add(id);
    if (isFact(n, id)) continue;
    for (const e of incomingLinks(n, id)) stack.push(linkPredecessor(e, id));
  }
  return seen;
}
export function regionLinks(n: Notebook, region: Set<string>): Link[] {
  return n.edges.filter(e => region.has(e.source) && region.has(e.target));
}

// 推导闭包：结论单位任选一条入连接，其余单位必须满足全部入连接。
export interface Resolution { nodes: string[]; edges: string[]; deps: [string, string][]; order: string[]; error: string }
export function resolveProof(n: Notebook, target: string, choices: Record<string, string> = {}): Resolution {
  const nodes = new Set<string>(), edges = new Set<string>(), deps: [string, string][] = [], stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (nodes.has(id)) continue;
    const unit = n.nodes.find(u => u.id === id);
    if (!unit) continue;
    nodes.add(id);
    if (unit.tags.includes('fact')) continue;
    const links = incomingLinks(n, id);
    if (!links.length) continue;
    const chosen = isConclusion(n, id) ? [links.find(e => e.id === choices[id]) || links[0]] : links;
    for (const e of chosen) {
      edges.add(e.id);
      const pred = linkPredecessor(e, id);
      deps.push([pred, id]);
      stack.push(pred);
    }
  }
  const order = topoOrder([...nodes], deps, n);
  return { nodes: [...nodes], edges: [...edges], deps, order: order || [...nodes], error: order ? '' : '推导连接存在循环，无法确定顺序' };
}

// 依赖拓扑排序；无依赖关系的单位保持笔记中的原始顺序。
export function topoOrder(ids: string[], deps: [string, string][], n?: Pick<Notebook, 'nodes'>): string[] | null {
  const rank = (id: string) => n ? n.nodes.findIndex(u => u.id === id) : 0;
  const indegree = new Map(ids.map(id => [id, 0])), outgoing = new Map<string, string[]>();
  for (const [from, to] of deps) {
    if (!indegree.has(from) || !indegree.has(to)) continue;
    outgoing.set(from, [...(outgoing.get(from) || []), to]);
    indegree.set(to, (indegree.get(to) || 0) + 1);
  }
  const queue = ids.filter(id => indegree.get(id) === 0).sort((a, b) => rank(a) - rank(b)), result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const next of outgoing.get(id) || []) {
      const left = (indegree.get(next) || 0) - 1;
      indegree.set(next, left);
      if (!left) queue.push(next);
    }
    queue.sort((a, b) => rank(a) - rank(b));
  }
  return result.length === ids.length ? result : null;
}
export function validOrder(order: string[], deps: [string, string][]) {
  const index = new Map(order.map((id, i) => [id, i]));
  return deps.every(([from, to]) => index.has(from) && index.has(to) && index.get(from)! < index.get(to)!);
}

export function validateProof(input: unknown): Proof {
  const p = proofSchema.parse(input);
  unique(p.nodes, '快照节点'); unique(p.edges, '快照连接');
  if (p.nodes.length !== p.nodeIds.length || p.edges.length !== p.edgeIds.length) throw new Error('推导文件数据不完整');
  if (new Set(p.nodeIds).size !== p.nodeIds.length || new Set(p.edgeIds).size !== p.edgeIds.length) throw new Error('推导文件存在重复引用');
  const ids = new Set(p.nodeIds), edgeIds = new Set(p.edgeIds);
  if (!ids.has(p.target)) throw new Error('推导目标不在快照中');
  if (p.nodes.some(u => !ids.has(u.id)) || p.edges.some(e => !edgeIds.has(e.id))) throw new Error('推导文件引用不一致');
  if (p.edges.some(e => !ids.has(e.source) || !ids.has(e.target))) throw new Error('推导文件连接端点无效');
  const order = p.order?.length ? p.order : [...p.nodeIds];
  if (order.length !== p.nodeIds.length || new Set(order).size !== p.nodeIds.length || order.some(id => !ids.has(id))) throw new Error('推导顺序无效');
  const index = new Map(order.map((id, i) => [id, i]));
  for (const e of p.edges) if (e.direction === 'single' && index.get(e.source)! >= index.get(e.target)!) throw new Error('推导顺序与连接方向冲突');
  p.order = order;
  return p;
}
export function snapshot(n: Notebook, target: string, nodeIds: string[], edgeIds: string[], order: string[]): Proof {
  const goal = n.nodes.find(u => u.id === target);
  if (!goal) throw new Error('推导目标不存在');
  if (order.length !== nodeIds.length || new Set(order).size !== order.length || order.some(id => !nodeIds.includes(id))) throw new Error('推导顺序与单位数量不一致');
  const nodes = order.map(id => n.nodes.find(u => u.id === id));
  const edges = edgeIds.map(id => n.edges.find(e => e.id === id));
  if (nodes.some(unit => !unit) || edges.some(edge => !edge)) throw new Error('推导引用了不存在的单位或连接');
  const proof: Proof = { kind: 'supernote-proof', version: 1, id: uid(), title: goal.content.replace(/[#*$]/g, '').slice(0, 32) || '推导', notebookId: n.id, target, nodeIds: [...order], edgeIds: [...edgeIds], order: [...order], nodes: structuredClone(nodes as Unit[]), edges: structuredClone(edges as Link[]) };
  return validateProof(proof);
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
