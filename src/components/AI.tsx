import { useRef, useState } from 'react';
import { Bot, Check, ChevronRight, Copy, ImagePlus, Plus, Send, Square, X } from 'lucide-react';
import { api, isDesktop } from '../bridge';
import { useStore } from '../store';
import { normalizeOperations } from '../ai-ops';
import { Markdown } from './Common';
import type { Notebook, Operation } from '../core';

interface ChatMessage { role: 'user' | 'assistant'; text: string }
const GRAPH_TASK = /```\s*graph\s*([\s\S]*?)```/i;
const GRAPH_BLOCK = /```\s*graph\s*[\s\S]*?```/gi;

export default function AI({ width, setWidth, hidden = false, incomingNodes = [], onConsumeNodes }: { width: number; setWidth: (w: number) => void; hidden?: boolean; incomingNodes?: string[]; onConsumeNodes?: (id?: string) => void }) {
  const { note } = useStore(); const [messages, setMessages] = useState<ChatMessage[]>([]); const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [attached, setAttached] = useState<string[]>([]); const [copied, setCopied] = useState<number | null>(null); const [level, setLevel] = useState<'brief' | 'normal' | 'detailed'>('normal'); const [phase, setPhase] = useState<'idle' | 'thinking' | 'streaming' | 'graph'>('idle'); const activeSession = useRef('');
  const selected = [...new Set([...attached, ...incomingNodes])];

  // 图谱 AI 返回的操作先规范化为可执行命令，再校验笔记版本并一次性提交。
  function applyGraph(revision: number, raw: Operation[]) {
    try {
      const state = useStore.getState();
      if (state.revision !== revision) throw new Error('笔记在 AI 处理期间被修改，本次改动未应用');
      const operations = normalizeOperations(state.note, raw);
      if (!operations.length) throw new Error('没有可应用的图谱修改');
      state.operate(operations);
      return `\n\n✓ 已按方案更新图谱（${operations.length} 项修改）。`;
    } catch (e) {
      return `\n\n⚠️ 图谱修改未应用：${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function copy(index: number) {
    const text = messages[index]?.text;
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => { setCopied(index); setTimeout(() => setCopied(null), 1500); }).catch(() => useStore.getState().setError('复制失败'));
  }

  // 两个 AI 共用同一套流式协议，按 kind 选择配置与提示词。
  async function stream(kind: 'qa' | 'graph', prompt: string, currentNote: Notebook, history: ChatMessage[], nodes: string[] = [], onText?: (value: string) => void) {
    const session = crypto.randomUUID();
    activeSession.current = session;
    const started = await api().start_ai(session, prompt, nodes, [], currentNote, history.map(m => ({ role: m.role, content: m.text })), kind, kind === 'qa' ? level : 'normal');
    if (!started.ok) throw new Error(started.error);
    let text = '', operations: Operation[] = [];
    for (;;) {
      const events = await api().poll_ai(session);
      if (!events.ok) throw new Error(events.error);
      for (const event of events.value) {
        if (event.type === 'text') { text += event.text || ''; onText?.(text); }
        if (event.type === 'operations' && event.operations) operations = event.operations;
        if (event.type === 'error') throw new Error(event.text);
      }
      if (events.value.some(event => event.type === 'done')) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return { text, operations };
  }

  async function ask() {
    const text = input.trim(); if (!text || busy) return;
    const history = messages;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setBusy(true); setPhase('thinking');
    const revision = useStore.getState().revision;
    const show = (value: string) => setMessages(current => {
      const last = current.at(-1);
      if (last?.role === 'assistant') { const next = [...current]; next[next.length - 1] = { ...last, text: value }; return next; }
      return [...current, { role: 'assistant', text: value }];
    });
    try {
      if (!isDesktop()) throw new Error('AI 对话需要桌面模式并完成 API 设置');
      const qa = await stream('qa', text, note, history, selected, value => { setPhase('streaming'); show(value); });
      const task = qa.text.match(GRAPH_TASK)?.[1]?.trim();
      let answer = qa.text.replace(GRAPH_BLOCK, '').trim();
      show(answer);
      if (task) {
        setPhase('graph');
        try {
          const graph = await stream('graph', task, useStore.getState().note, []);
          answer += graph.operations.length ? applyGraph(revision, graph.operations) : '\n\n图谱 AI 没有返回可应用的修改。';
          show(answer);
        } catch (error) {
          answer += `\n\n⚠️ 图谱更新失败：${error instanceof Error ? error.message : String(error)}`;
          show(answer);
        }
      }
      show(answer || '已完成。');
    } catch (error) {
      show(`⚠️ ${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); setAttached([]); setPhase('idle'); }
  }

  return <aside className={`ai-panel${hidden ? ' hidden' : ''}`} style={{ width }}><div className="resize-handle ai-resize" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.max(320, Math.min(window.innerWidth - 100, window.innerWidth - e.clientX))); }}/><header className="ai-header"><div><span className="eyebrow"><Bot size={13}/> AI 学习助手</span><h2>问问你的知识</h2></div><button className="round-button" title="新建对话" onClick={() => { setMessages([]); setAttached([]); }}><Plus size={17}/></button></header>
    <div className="ai-messages">{!messages.length && <div className="ai-welcome"><Bot size={36}/><h3>从一个问题开始</h3><p>在导图节点右键选择“添加到 AI 对话框”，再输入你的问题。</p><div className="suggestions"><button onClick={() => setInput('帮我解释当前导图中的核心结论')}>解释核心结论 <ChevronRight size={14}/></button><button onClick={() => setInput('检查这部分推导是否完整')}>检查推导 <ChevronRight size={14}/></button></div></div>}{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><div className="message-head"><span className="message-role">{m.role === 'user' ? '你' : 'AI'}</span><div className="message-tools">{m.role === 'assistant' && i === messages.length - 1 && phase !== 'idle' && <span className={`message-status ${phase}`}>{phase === 'thinking' ? '正在思考' : phase === 'graph' ? '正在修改思维导图' : '正在输出'}</span>}{m.role === 'assistant' && <button className="copy-button" title={copied === i ? '已复制' : '复制回答'} onClick={() => copy(i)}>{copied === i ? <Check size={12}/> : <Copy size={12}/>}</button>}</div></div>{m.role === 'assistant' ? <div className="message-body"><Markdown>{m.text}</Markdown></div> : <div>{m.text}</div>}</div>)}</div>
    <div className="ai-composer">{selected.length > 0 && <div className="attachments">{selected.map(nodeId => <span key={nodeId}>{note.nodes.find(n => n.id === nodeId)?.content.slice(0, 22)} <button onClick={() => { setAttached(a => a.filter(x => x !== nodeId)); onConsumeNodes?.(nodeId); }}><X size={12}/></button></span>)}</div>}<textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder="输入问题，Enter 发送"/><div className="composer-actions"><label title="添加图片"><ImagePlus size={17}/><input type="file" accept="image/*" hidden/></label><span className="composer-tip">右键节点添加 · Shift+Enter 换行</span>{busy ? <button className="send-button stop" onClick={() => api().cancel_ai(activeSession.current)}><Square size={15}/></button> : <button className="send-button" disabled={!input.trim()} onClick={() => { onConsumeNodes?.(); ask(); }}><Send size={15}/></button>}</div><div className="ai-mode-row"><span className="ai-mode-label">模式</span>{(['brief', 'normal', 'detailed'] as const).map(value => <button key={value} className={level === value ? 'active' : ''} onClick={() => setLevel(value)}>{value === 'brief' ? '简略' : value === 'detailed' ? '详细' : '中等'}</button>)}</div></div></aside>;
}
