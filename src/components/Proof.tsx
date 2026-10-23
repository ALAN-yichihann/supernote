import { useMemo, useState } from 'react';
import { Background, Handle, MarkerType, Position, ReactFlow, type Edge as FlowEdge, type Node as FlowNode, type NodeProps } from '@xyflow/react';
import { ArrowLeft, Download, Edit3, Eye, GripVertical, Sparkles } from 'lucide-react';
import { incomingLinks, isConclusion, linkPredecessor, proofRegion, regionLinks, resolveProof, snapshot, validOrder, type Notebook, type Proof } from '../core';
import { useStore, safely } from '../store';
import { saveFile } from '../bridge';
import { IconButton, Markdown } from './Common';

interface ProofNodeData extends Record<string, unknown> { label: string; fact: boolean; conclusion: boolean; active: boolean }
function ProofNode({ data }: NodeProps<FlowNode<ProofNodeData>>) {
  return <div className={`proof-node ${data.fact ? 'fact' : ''} ${data.conclusion ? 'conclusion' : ''} ${data.active ? 'active' : 'dim'}`}>
    <Handle type="target" position={Position.Top}/>
    <span>{data.label}</span>
    <Handle type="source" position={Position.Bottom}/>
  </div>;
}
const nodeTypes = { proof: ProofNode };
const plain = (text: string, length: number) => text.replace(/[#*_`$>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length) || '空单位';
const name = (text: string) => text.split(/[：:]/)[0].replace(/[#*_`$>]/g, '').trim().slice(0, 12) || '未命名';

// 按最长依赖链分层：基本事实在最上，目标在最下，保证同一节点的所有前驱都在上一层。
function buildGraph(note: Notebook, region: Set<string>, resolution: ReturnType<typeof resolveProof>) {
  const links = regionLinks(note, region);
  const preds = new Map<string, string[]>();
  for (const link of links) {
    if (!region.has(link.source) || !region.has(link.target)) continue;
    preds.set(link.target, [...(preds.get(link.target) || []), link.source]);
  }
  const level = new Map<string, number>();
  const levelOf = (id: string, seen: Set<string>): number => {
    const cached = level.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = (preds.get(id) || []).filter(parent => region.has(parent) && parent !== id);
    const value = parents.length ? Math.max(...parents.map(parent => levelOf(parent, seen))) + 1 : 0;
    seen.delete(id);
    level.set(id, value);
    return value;
  };
  for (const id of region) levelOf(id, new Set());
  const levels = new Map<number, string[]>();
  for (const id of region) {
    const depth = level.get(id) ?? 0;
    levels.set(depth, [...(levels.get(depth) || []), id]);
  }
  const nodes: FlowNode[] = [];
  for (const [depth, ids] of levels) {
    ids.sort((a, b) => note.nodes.findIndex(u => u.id === a) - note.nodes.findIndex(u => u.id === b));
    ids.forEach((id, index) => {
      const unit = note.nodes.find(u => u.id === id)!;
      nodes.push({ id, type: 'proof', position: { x: (index - (ids.length - 1) / 2) * 172, y: depth * 84 }, draggable: false, data: { label: plain(unit.content, 30), fact: unit.tags.includes('fact'), conclusion: unit.tags.includes('conclusion'), active: resolution.nodes.includes(id) } });
    });
  }
  const edges: FlowEdge[] = links.map(link => {
    const from = level.get(link.source) ?? 0, to = level.get(link.target) ?? 0;
    const [pred, succ] = from <= to ? [link.source, link.target] : [link.target, link.source];
    const selected = resolution.edges.includes(link.id), optional = isConclusion(note, succ);
    return { id: link.id, source: pred, target: succ, type: 'default', interactionWidth: 26, markerEnd: { type: MarkerType.ArrowClosed, color: selected ? '#4a86d8' : '#b9c9da' }, style: { stroke: selected ? '#4a86d8' : '#c3d1e0', strokeWidth: selected ? 2.2 : 1.4, strokeDasharray: optional ? '6 4' : undefined }, data: { optional, target: succ }, className: `proof-edge${optional ? ' optional' : ''}${selected ? ' active' : ''}` };
  });
  return { nodes, edges };
}

export default function ProofView({ target, close }: { target: string; close: () => void }) {
  const { note } = useStore();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<{ signature: string; order: string[] }>();
  const [drag, setDrag] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [width, setWidth] = useState(820);

  const goal = note.nodes.find(unit => unit.id === target);
  const region = useMemo(() => proofRegion(note, target), [note, target]);
  const resolution = useMemo(() => resolveProof(note, target, choices), [note, target, choices]);
  const signature = useMemo(() => `${target}|${[...resolution.nodes].sort().join(',')}|${[...resolution.edges].sort().join(',')}`, [target, resolution]);
  const order = manual?.signature === signature ? manual.order : resolution.order;
  const graph = useMemo(() => buildGraph(note, region, resolution), [note, region, resolution]);
  const optionalTargets = useMemo(() => [...region].filter(id => isConclusion(note, id) && incomingLinks(note, id).length > 1), [note, region]);

  const imageContent = order.map(id => note.nodes.find(unit => unit.id === id)).filter((unit): unit is NonNullable<typeof unit> => !!unit?.image).map((unit, index) => `![推导图片 ${index + 1}](${unit.image})`).join('\n\n');
  const generatedContent = order.map(id => note.nodes.find(unit => unit.id === id)?.content || '').join('\n\n');
  const content = [imageContent, text || generatedContent].filter(Boolean).join('\n\n');
  const proof: Proof | null = useMemo(() => {
    if (resolution.error || !order.length || !validOrder(order, resolution.deps)) return null;
    try { return snapshot(note, target, resolution.nodes, resolution.edges, order); } catch { return null; }
  }, [note, target, resolution, order]);

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    if (!validOrder(next, resolution.deps)) { useStore.getState().setError('该顺序会破坏推导依赖，已取消'); return; }
    setManual({ signature, order: next });
    setText('');
  }
  function choose(target: string, edge: string) {
    setChoices(current => ({ ...current, [target]: edge }));
    setText('');
  }

  return <div className="proof-panel" style={{ width }}>
    <div className="proof-resize" onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.max(640, Math.min(window.innerWidth - 130, width + e.movementX))); }}/>
    <header className="panel-header">
      <div className="panel-title">
        <IconButton title="关闭推导页" onClick={close}><ArrowLeft size={18}/></IconButton>
        <div><span className="eyebrow">推导过程</span><h2>{goal?.content.slice(0, 28) || '目标已删除'}</h2></div>
      </div>
      <div className="panel-actions">
        <IconButton title={editing ? '阅读模式' : '编辑模式'} active={editing} onClick={() => setEditing(!editing)}>{editing ? <Eye size={17}/> : <Edit3 size={17}/>}</IconButton>
        <IconButton title="保存推导过程" disabled={!proof} onClick={() => proof && saveFile(proof, true)}><Download size={17}/></IconButton>
      </div>
    </header>
    <div className="proof-body">
      <div className="proof-path">
        <div className="proof-section-title"><span className="eyebrow">推导思维导图</span><span className="proof-hint">点击虚线连接切换推导方式</span></div>
        <div className="proof-graph">
          <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false} onEdgeClick={(_, edge) => { const data = edge.data as { optional?: boolean; target?: string } | undefined; if (data?.optional && data.target) choose(data.target, edge.id); }} proOptions={{ hideAttribution: true }}>
            <Background gap={18} size={1} color="#e3ecf6"/>
          </ReactFlow>
        </div>
        <div className="proof-legend"><span><i className="legend-line solid"/>必要条件</span><span><i className="legend-line dashed"/>可选的推导方式</span></div>
        {optionalTargets.length > 0 && <div className="proof-options">
          <span className="eyebrow">推导方式</span>
          {optionalTargets.map(id => {
            const links = incomingLinks(note, id), chosen = choices[id] ?? links[0]?.id;
            return <div className="option-row" key={id}>
              <span className="option-label">{name(note.nodes.find(unit => unit.id === id)?.content || '')}</span>
              {links.map(link => <button key={link.id} className={chosen === link.id ? 'active' : ''} title={plain(note.nodes.find(unit => unit.id === linkPredecessor(link, id))?.content || '', 40)} onClick={() => choose(id, link.id)}>{name(note.nodes.find(unit => unit.id === linkPredecessor(link, id))?.content || '')}</button>)}
            </div>;
          })}
        </div>}
        <div className="proof-section-title"><span className="eyebrow">推导顺序</span><span className="proof-hint">{order.length} 个模块 · 拖动调整</span></div>
        <ol className="module-list">
          {order.map((id, index) => <li key={id} draggable className={drag === index ? 'dragging' : ''}
            onDragStart={e => { setDrag(index); e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => setDrag(null)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from) && from >= 0 && from < order.length) move(from, index); setDrag(null); }}>
            <GripVertical size={13}/>
            <span className="module-index">{index + 1}</span>
            <span className="module-text">{note.nodes.find(unit => unit.id === id)?.content.replace(/[#*_`$]/g, ' ').slice(0, 40) || '空单位'}</span>
          </li>)}
        </ol>
        {resolution.error && <p className="field-error">{resolution.error}</p>}
        <button className="generate" disabled={!!resolution.error || !order.length} onClick={() => setText([imageContent, generatedContent].filter(Boolean).join('\n\n'))}><Sparkles size={16}/>生成推导文本</button>
      </div>
      <div className="proof-text">
        {editing ? <textarea value={content} onChange={e => setText(e.target.value)} placeholder="选择推导方式并调整顺序后生成推导过程"/> : <Markdown>{content || '在左侧选择推导路径。'}</Markdown>}
        {proof && <button className="primary" onClick={() => safely(() => { const existing = note.proofs.find(item => item.target === target); const next = existing ? note.proofs.map(item => item.id === existing.id ? proof : item) : [...note.proofs, proof]; useStore.getState().commit({ ...note, proofs: next }); })}>保存并同步</button>}
      </div>
    </div>
  </div>;
}
